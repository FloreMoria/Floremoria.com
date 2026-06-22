/**
 * POSTMAN SYNC — Cron per assistenza@floremoria.com (risposte automatiche VERA/POSTMAN).
 *
 * Flusso: legge mail UNSEEN via IMAP → filtra blacklist → classifica e redige risposta →
 * invio diretto SMTP (thread In-Reply-To / References) → log audit → marca come letta.
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { classifyAndDraft, PostmanConfigError } from '@/lib/postman/agent';
import { isEmailBlacklisted } from '@/lib/postman/emailBlacklist';
import {
    createImapClient,
    fetchUnseenEmails,
    getMailboxConfigFromEnv,
    markEmailSeen,
    MailboxConfigError,
    sendDirectReply,
} from '@/lib/postman/mailbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isAuthorized(request: Request): boolean {
    const secret = process.env.POSTMAN_CRON_SECRET?.trim() || process.env.CRON_SECRET?.trim();
    if (!secret) return false;
    const auth = request.headers.get('authorization') || '';
    if (auth.replace(/^Bearer\s+/i, '').trim() === secret) return true;
    const headerKey = request.headers.get('x-cron-key')?.trim();
    return headerKey === secret;
}

function romeDateIso(d: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Rome',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(d);
}

interface ProcessResult {
    uid: number;
    messageId: string | null;
    from: string;
    category?: string;
    status: 'reply_sent' | 'skipped_blacklist' | 'skipped_duplicate' | 'error';
    error?: string;
}

async function runSync(): Promise<{
    ok: boolean;
    found: number;
    processed: number;
    results: ProcessResult[];
    note?: string;
}> {
    const config = getMailboxConfigFromEnv();
    const limit = Math.max(1, Number(process.env.POSTMAN_MAX_EMAILS?.trim() || '10') || 10);
    const markSeen = process.env.POSTMAN_MARK_SEEN?.trim() !== 'false';

    const client = createImapClient(config);
    const results: ProcessResult[] = [];

    await client.connect();
    try {
        const emails = await fetchUnseenEmails(client, limit);
        if (emails.length === 0) {
            return { ok: true, found: 0, processed: 0, results, note: 'Nessuna mail non letta.' };
        }

        for (const email of emails) {
            const r: ProcessResult = {
                uid: email.uid,
                messageId: email.messageId,
                from: email.fromEmail,
                status: 'error',
            };
            try {
                if (await isEmailBlacklisted(email.fromEmail)) {
                    r.status = 'skipped_blacklist';
                    results.push(r);
                    if (markSeen) await markEmailSeen(client, email.uid).catch(() => undefined);
                    continue;
                }

                if (email.messageId) {
                    const existing = await prisma.floremoriaLog.findFirst({
                        where: { keyPrompt: { contains: email.messageId } },
                        select: { id: true },
                    });
                    if (existing) {
                        r.status = 'skipped_duplicate';
                        results.push(r);
                        if (markSeen) await markEmailSeen(client, email.uid).catch(() => undefined);
                        continue;
                    }
                }

                const draft = await classifyAndDraft({
                    fromName: email.fromName,
                    fromEmail: email.fromEmail,
                    subject: email.subject,
                    text: email.text,
                });
                r.category = draft.category;

                await sendDirectReply(config, {
                    fromAddress: config.user,
                    toAddress: email.fromEmail,
                    subject: draft.subject,
                    body: draft.body,
                    inReplyToMessageId: email.messageId,
                    references: email.references,
                });

                const today = romeDateIso(new Date());
                const fullText = [
                    `RISPOSTA AUTOMATICA INVIATA — assistenza@floremoria.com`,
                    `Da: ${email.fromName || ''} <${email.fromEmail}>`,
                    `Categoria: ${draft.category} — ${draft.reasoning}`,
                    `Oggetto: ${draft.subject}`,
                    '',
                    '--- Testo inviato (firma e messaggio originale inclusi) ---',
                    draft.body,
                ].join('\n');

                await prisma.floremoriaLog.create({
                    data: {
                        sessionDate: new Date(),
                        tag: `#POSTMAN_ASSISTENZA_${today}, #${draft.category}`,
                        topic: email.subject || '(senza oggetto)',
                        shortSummary: draft.reasoning || `Risposta categoria ${draft.category} inviata.`,
                        keyPrompt: `POSTMAN msgid:${email.messageId || `uid-${email.uid}-${today}`}`,
                        fullText,
                        discussedPoints: `Email da ${email.fromEmail} classificata come ${draft.category}.`,
                        achievedResults: 'Risposta inviata direttamente al mittente via SMTP.',
                        pendingTasks: null,
                        criticalAlarms: null,
                    },
                });

                if (markSeen) await markEmailSeen(client, email.uid);
                r.status = 'reply_sent';
            } catch (e) {
                r.error = e instanceof Error ? e.message : String(e);
                console.error(`[postman] Errore elaborazione uid=${email.uid}:`, r.error);
            }
            results.push(r);
        }

        const processed = results.filter((x) => x.status === 'reply_sent').length;
        return { ok: true, found: emails.length, processed, results };
    } finally {
        await client.logout().catch(() => undefined);
    }
}

async function handle(request: Request): Promise<NextResponse> {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    try {
        const summary = await runSync();
        return NextResponse.json(summary);
    } catch (e) {
        if (e instanceof MailboxConfigError || e instanceof PostmanConfigError) {
            console.error('[postman] Configurazione mancante:', e.message);
            return NextResponse.json({ error: 'not_configured', detail: e.message }, { status: 503 });
        }
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[postman] Errore sync:', msg);
        return NextResponse.json({ error: 'sync_failed', detail: msg }, { status: 500 });
    }
}

export async function GET(request: Request) {
    return handle(request);
}

export async function POST(request: Request) {
    return handle(request);
}
