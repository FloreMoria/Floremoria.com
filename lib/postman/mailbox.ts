/**
 * POSTMAN — Accesso IMAP alla casella assistenza@floremoria.com (Aruba).
 *
 * Operazioni:
 *  - connessione IMAPS sicura (default imaps.aruba.it:993, SSL);
 *  - lettura delle mail NON LETTE (UNSEEN) della INBOX con parsing del testo;
 *  - salvataggio della BOZZA di risposta nella cartella Drafts via IMAP APPEND (nessun invio);
 *  - marcatura della mail come letta (\Seen) per garantire l'idempotenza tra esecuzioni del cron.
 *
 * Stack: imapflow (IMAP), mailparser (parsing), nodemailer/MailComposer (composizione MIME della bozza).
 */
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import MailComposer from 'nodemailer/lib/mail-composer';

export interface IncomingEmail {
    uid: number;
    messageId: string | null;
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
                out.push({
                    uid: message.uid,
                    messageId: parsed.messageId || message.envelope?.messageId || null,
                    fromName: from.name,
                    fromEmail: from.address,
                    subject: (parsed.subject || message.envelope?.subject || '').trim(),
                    text: (parsed.text || '').trim(),
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

/** Salva una bozza di risposta nella cartella Drafts (flag \Draft). Nessun invio. */
export async function appendDraftReply(
    client: ImapFlow,
    draftsPath: string,
    params: {
        fromAddress: string;
        toAddress: string;
        subject: string;
        body: string;
        inReplyToMessageId?: string | null;
    }
): Promise<void> {
    const mime = await buildMimeMessage({
        from: params.fromAddress,
        to: params.toAddress,
        subject: params.subject,
        text: params.body,
        inReplyTo: params.inReplyToMessageId,
        references: params.inReplyToMessageId,
    });
    await client.append(draftsPath, mime, ['\\Draft'], new Date());
}

/** Marca una mail come letta (\Seen): evita la rielaborazione alla prossima esecuzione del cron. */
export async function markEmailSeen(client: ImapFlow, uid: number): Promise<void> {
    await client.messageFlagsAdd({ uid: String(uid) }, ['\\Seen'], { uid: true });
}
