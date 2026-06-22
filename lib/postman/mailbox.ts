/**
 * POSTMAN — Accesso IMAP alla casella assistenza@floremoria.com (Aruba).
 *
 * Operazioni:
 *  - connessione IMAPS sicura (default imaps.aruba.it:993, SSL);
 *  - lettura delle mail NON LETTE (UNSEEN) della INBOX con parsing del testo;
 *  - invio diretto della risposta via SMTP (thread In-Reply-To / References);
 *  - marcatura della mail come letta (\Seen) per garantire l'idempotenza tra esecuzioni del cron.
 *
 * Stack: imapflow (IMAP), mailparser (parsing), nodemailer/MailComposer (composizione MIME della bozza).
 */
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import MailComposer from 'nodemailer/lib/mail-composer';
import nodemailer from 'nodemailer';

export interface IncomingEmail {
    uid: number;
    messageId: string | null;
    references: string | null;
    fromName: string;
    fromEmail: string;
    subject: string;
    text: string;
    date: Date | null;
}

export interface MailboxConfig {
    host: string;
    port: number;
    user: string;
    password: string;
    draftsFolder?: string;
}

export class MailboxConfigError extends Error {}

export function getMailboxConfigFromEnv(): MailboxConfig {
    const host = process.env.ASSISTENZA_IMAP_HOST?.trim() || 'imaps.aruba.it';
    const port = Number(process.env.ASSISTENZA_IMAP_PORT?.trim() || '993');
    const user = process.env.ASSISTENZA_EMAIL_USER?.trim();
    const password = process.env.ASSISTENZA_EMAIL_PASSWORD;

    if (!user || !password) {
        throw new MailboxConfigError(
            'Credenziali IMAP mancanti: imposta ASSISTENZA_EMAIL_USER e ASSISTENZA_EMAIL_PASSWORD.'
        );
    }

    return {
        host,
        port: Number.isFinite(port) ? port : 993,
        user,
        password,
        draftsFolder: process.env.ASSISTENZA_DRAFTS_FOLDER?.trim() || undefined,
    };
}

export function createImapClient(config: MailboxConfig): ImapFlow {
    return new ImapFlow({
        host: config.host,
        port: config.port,
        secure: true,
        auth: { user: config.user, pass: config.password },
        logger: false,
    });
}

function firstAddress(value: unknown): { name: string; address: string } {
    // mailparser AddressObject: { value: [{ name, address }], ... }
    const v = value as { value?: { name?: string; address?: string }[] } | undefined;
    const first = v?.value?.[0];
    return { name: first?.name?.trim() || '', address: first?.address?.trim() || '' };
}

/** Legge le mail UNSEEN della INBOX (fino a `limit`) e ne estrae i campi utili. */
export async function fetchUnseenEmails(client: ImapFlow, limit: number): Promise<IncomingEmail[]> {
    const out: IncomingEmail[] = [];
    const lock = await client.getMailboxLock('INBOX');
    try {
        const uids = (await client.search({ seen: false }, { uid: true })) || [];
        if (!uids.length) return out;

        // I più recenti per primi, troncati a `limit`.
        const selected = uids.slice(-Math.max(0, limit)).reverse();

        for await (const message of client.fetch(
            selected,
            { uid: true, source: true, envelope: true },
            { uid: true }
        )) {
            try {
                const parsed = await simpleParser(message.source as Buffer);
                const from = firstAddress(parsed.from);
                
                let messageId = parsed.messageId || message.envelope?.messageId || null;
                if (!messageId) {
                    const fromStr = from.address || 'unknown';
                    const dateStr = (parsed.date || message.envelope?.date || new Date()).getTime();
                    const subStr = (parsed.subject || message.envelope?.subject || '').replace(/\s+/g, '').slice(0, 30);
                    messageId = `fallback-msgid-${fromStr}-${dateStr}-${subStr}`;
                }

                let text = (parsed.text || '').trim();
                if (!text && parsed.html) {
                    // Simple regex fallback to strip HTML tags and extract usable text for Gemini
                    text = parsed.html
                        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                        .replace(/<[^>]+>/g, ' ')
                        .replace(/\s+/g, ' ')
                        .trim();
                }

                let references: string | null = null;
                if (parsed.references) {
                    references = Array.isArray(parsed.references)
                        ? parsed.references.join(' ')
                        : String(parsed.references);
                }

                out.push({
                    uid: message.uid,
                    messageId,
                    references,
                    fromName: from.name,
                    fromEmail: from.address,
                    subject: (parsed.subject || message.envelope?.subject || '').trim(),
                    text,
                    date: parsed.date || message.envelope?.date || null,
                });
            } catch (e) {
                console.error(`[postman] Parsing fallito per uid=${message.uid}:`, e);
            }
        }
    } finally {
        lock.release();
    }
    return out;
}

/** Risolve il path della cartella Bozze (env, poi special-use \Drafts, poi euristica nome). */
export async function resolveDraftsPath(client: ImapFlow, configured?: string): Promise<string> {
    if (configured) return configured;
    try {
        const list = await client.list();
        const special = list.find((m) => m.specialUse === '\\Drafts');
        if (special) return special.path;
        const byName = list.find((m) => /drafts|bozze/i.test(m.path) || /drafts|bozze/i.test(m.name || ''));
        if (byName) return byName.path;
    } catch (e) {
        console.warn('[postman] Impossibile elencare le cartelle IMAP, uso "Drafts":', e);
    }
    return 'Drafts';
}

function buildReferencesHeader(
    inReplyToMessageId?: string | null,
    priorReferences?: string | null
): string | undefined {
    const parts: string[] = [];
    if (priorReferences?.trim()) {
        parts.push(...priorReferences.trim().split(/\s+/).filter(Boolean));
    }
    if (inReplyToMessageId?.trim()) {
        const id = inReplyToMessageId.trim();
        if (!parts.includes(id)) parts.push(id);
    }
    return parts.length ? parts.join(' ') : undefined;
}

function buildMimeMessage(opts: {
    from: string;
    to: string;
    subject: string;
    text: string;
    inReplyTo?: string | null;
    references?: string | null;
}): Promise<Buffer> {
    const composer = new MailComposer({
        from: opts.from,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        inReplyTo: opts.inReplyTo || undefined,
        references: opts.references || undefined,
        date: new Date(),
    });
    return new Promise<Buffer>((resolve, reject) => {
        composer.compile().build((err, message) => {
            if (err) reject(err);
            else resolve(message);
        });
    });
}

/** Invia direttamente la risposta al cliente via SMTP (Aruba assistenza@). */
export async function sendDirectReply(
    config: MailboxConfig,
    params: {
        fromAddress: string;
        toAddress: string;
        subject: string;
        body: string;
        inReplyToMessageId?: string | null;
        references?: string | null;
    }
): Promise<void> {
    const host = process.env.ASSISTENZA_SMTP_HOST?.trim() || 'smtps.aruba.it';
    const port = Number(process.env.ASSISTENZA_SMTP_PORT?.trim() || '465');
    const secure = process.env.ASSISTENZA_SMTP_SECURE?.trim() !== 'false';

    const transporter = nodemailer.createTransport({
        host,
        port: Number.isFinite(port) ? port : 465,
        secure: secure || port === 465,
        auth: { user: config.user, pass: config.password },
    });

    const references = buildReferencesHeader(params.inReplyToMessageId, params.references);

    await transporter.sendMail({
        from: params.fromAddress.includes('<')
            ? params.fromAddress
            : `FloreMoria Assistenza <${params.fromAddress}>`,
        to: params.toAddress,
        subject: params.subject,
        text: params.body,
        inReplyTo: params.inReplyToMessageId || undefined,
        references,
    });
}

/** @deprecated Usare sendDirectReply. Mantenuto per compatibilità test. */
export async function appendDraftReply(
    client: ImapFlow,
    draftsPath: string,
    params: {
        fromAddress: string;
        toAddress: string;
        subject: string;
        body: string;
        inReplyToMessageId?: string | null;
        references?: string | null;
    }
): Promise<void> {
    const mime = await buildMimeMessage({
        from: params.fromAddress,
        to: params.toAddress,
        subject: params.subject,
        text: params.body,
        inReplyTo: params.inReplyToMessageId || undefined,
        references: buildReferencesHeader(params.inReplyToMessageId, params.references),
    });
    await client.append(draftsPath, mime, ['\\Draft'], new Date());
}

/** Marca una mail come letta (\Seen): evita la rielaborazione alla prossima esecuzione del cron. */
export async function markEmailSeen(client: ImapFlow, uid: number): Promise<void> {
    await client.messageFlagsAdd({ uid: String(uid) }, ['\\Seen'], { uid: true });
}
