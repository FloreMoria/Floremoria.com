/**
 * POSTMAN SYNC — Fallback IMAP per assistenza@floremoria.com (polling manuale / cron esterno).
 *
 * Per risposte in tempo reale su Vercel Hobby preferire:
 * POST /api/webhooks/assistenza-email (Resend inbound o forwarder).
 */
import { NextResponse } from 'next/server';
import { PostmanConfigError } from '@/lib/postman/agent';
import { isEmailBlacklisted } from '@/lib/postman/emailBlacklist';
import {
    createImapClient,
    fetchUnseenEmails,
    getMailboxConfigFromEnv,
    markEmailSeen,
    MailboxConfigError,
} from '@/lib/postman/mailbox';
import { processAssistenzaInboundEmail } from '@/lib/postman/processAssistenzaEmail';
import { triggerPostmanBackgroundSync } from '@/lib/postman/triggerBackgroundSync';

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

interface ProcessResult {
    uid: number;
    messageId: string | null;
    from: string;
    category?: string;
    status: 'reply_sent' | 'skipped_blacklist' | 'skipped_duplicate' | 'skipped_system_sender' | 'error';
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
    const limit = Math.max(1, Number(process.env.POSTMAN_MAX_EMAILS?.trim() || '20') || 20);
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

                const outcome = await processAssistenzaInboundEmail(
                    {
                        fromName: email.fromName,
                        fromEmail: email.fromEmail,
                        subject: email.subject,
                        text: email.text,
                        messageId: email.messageId,
                        references: email.references,
                    },
                    config
                );

                r.category = outcome.category;
                r.status =
                    outcome.status === 'reply_sent'
                        ? 'reply_sent'
                        : outcome.status === 'skipped_duplicate'
                          ? 'skipped_duplicate'
                          : outcome.status === 'skipped_system_sender'
                            ? 'skipped_system_sender'
                          : outcome.status === 'skipped_blacklist'
                            ? 'skipped_blacklist'
                          : 'error';
                r.error = outcome.error;

                if (outcome.status === 'reply_sent' && markSeen) {
                    await markEmailSeen(client, email.uid);
                } else if (markSeen && outcome.status !== 'error') {
                    await markEmailSeen(client, email.uid).catch(() => undefined);
                }
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
