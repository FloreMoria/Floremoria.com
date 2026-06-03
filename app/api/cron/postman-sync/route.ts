/**
 * POSTMAN SYNC — Cron Human-in-the-Loop per assistenza@floremoria.com.
 *
 * Flusso: legge le mail UNSEEN via IMAP (Aruba) → l'agent LLM classifica (FF/FT/PA) e redige una bozza
 * → la bozza viene salvata nei Drafts via IMAP APPEND (mai inviata) → si registra un record in
 * floremoria_logs (visibile/approvabile in dashboard) → la mail viene marcata come letta (idempotenza).
 *
 * Protezione: header Authorization "Bearer <CRON_SECRET>" (compatibile con i Vercel Cron) oppure
 * header "x-cron-key". Senza segreto configurato l'endpoint è disabilitato.
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { classifyAndDraft, PostmanConfigError } from '@/lib/postman/agent';
import {
    appendDraftReply,
    createImapClient,
    fetchUnseenEmails,
    getMailboxConfigFromEnv,
    markEmailSeen,
    MailboxConfigError,
    resolveDraftsPath,
} from '@/lib/postman/mailbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isAuthorized(request: Request): boolean {
    const secret = process.env.POSTMAN_CRON_SECRET?.trim() || process.env.CRON_SECRET?.trim();
    if (!secret) return false; // endpoint disabilitato finché non è configurato un segreto
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
    status: 'draft_created' | 'skipped_duplicate' | 'error';
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
    const markSeen = process.env.POSTMAN_MARK_SEEN?.trim() !== 'false'; // default: true

    const client = createImapClient(config);
    const results: ProcessResult[] = [];

    await client.connect();
    try {
        const emails = await fetchUnseenEmails(client, limit);
        if (emails.length === 0) {
            return { ok: true, found: 0, processed: 0, results, note: 'Nessuna mail non letta.' };
        }

        const draftsPath = await resolveDraftsPath(client, config.draftsFolder);

        for (const email of emails) {
            const r: ProcessResult = {
                uid: email.uid,
                messageId: email.messageId,
                from: email.fromEmail,
                status: 'error',
            };
            try {
                // Deduplica: se esiste già un log per questo messageId, non rigeneriamo la bozza.
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

                await appendDraftReply(client, draftsPath, {
                    fromAddress: config.user,
                    toAddress: email.fromEmail,
                    subject: draft.subject,
                    body: draft.body,
                    inReplyToMessageId: email.messageId,
                });

                const today = romeDateIso(new Date());
                const fullText = [
                    `BOZZA DI RISPOSTA (Human-in-the-Loop) — salvata nei Drafts di Aruba, NON inviata.`,
                    `Da: ${email.fromName || ''} <${email.fromEmail}>`,
                    `Categoria: ${draft.category} — ${draft.reasoning}`,
                    `Oggetto bozza: ${draft.subject}`,
                    '',
                    '--- Testo della bozza ---',
                    draft.body,
                    '',
                    '--- Email originale ricevuta ---',
                    (email.text || '').slice(0, 4000),
                ].join('\n');

                await prisma.floremoriaLog.create({
                    data: {
                        sessionDate: new Date(),
                        tag: `#POSTMAN_ASSISTENZA_${today}, #${draft.category}`,
                        topic: email.subject || '(senza oggetto)',
                        shortSummary: draft.reasoning || `Bozza categoria ${draft.category} pronta per revisione.`,
                        keyPrompt: `POSTMAN msgid:${email.messageId || `uid-${email.uid}-${today}`}`,
                        fullText,
                        discussedPoints: `Email da ${email.fromEmail} classificata come ${draft.category}.`,
                        achievedResults: 'Bozza salvata nei Drafts, in attesa di approvazione umana.',
                        pendingTasks: 'Revisione e invio manuale della bozza dalla casella Aruba.',
                        criticalAlarms: null,
                    },
                });

                if (markSeen) await markEmailSeen(client, email.uid);
                r.status = 'draft_created';
            } catch (e) {
                r.error = e instanceof Error ? e.message : String(e);
                console.error(`[postman] Errore elaborazione uid=${email.uid}:`, r.error);
            }
            results.push(r);
        }

        const processed = results.filter((x) => x.status === 'draft_created').length;
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
