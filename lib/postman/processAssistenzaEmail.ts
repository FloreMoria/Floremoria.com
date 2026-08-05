import prisma from '@/lib/prisma';
import { classifyAndDraft, PostmanConfigError } from '@/lib/postman/agent';
import { isEmailBlacklisted } from '@/lib/postman/emailBlacklist';
import {
    tryGetMailboxConfigFromEnv,
    sendDirectReply,
    type MailboxConfig,
} from '@/lib/postman/mailbox';
import { isSystemEmailSender } from '@/lib/postman/systemSenders';

export interface AssistenzaEmailInput {
    fromName?: string;
    fromEmail: string;
    subject?: string;
    text?: string;
    messageId?: string | null;
    references?: string | null;
}

export type AssistenzaEmailProcessStatus =
    | 'reply_sent'
    | 'skipped_blacklist'
    | 'skipped_duplicate'
    | 'skipped_invalid'
    | 'skipped_system_sender'
    | 'error';

export interface AssistenzaEmailProcessResult {
    status: AssistenzaEmailProcessStatus;
    category?: string;
    error?: string;
    provider?: string;
    logId?: number;
}

function romeDateIso(d: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Rome',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(d);
}

/**
 * Elabora una singola email in arrivo su assistenza@floremoria.com:
 * classifica con POSTMAN/Gemini e risponde via SMTP/Resend in thread.
 */
export async function processAssistenzaInboundEmail(
    email: AssistenzaEmailInput,
    config: MailboxConfig | null = tryGetMailboxConfigFromEnv(),
    options?: { forceReProcess?: boolean }
): Promise<AssistenzaEmailProcessResult> {
    const fromEmail = email.fromEmail?.trim().toLowerCase();
    if (!fromEmail || !fromEmail.includes('@')) {
        return { status: 'skipped_invalid', error: 'missing_from_email' };
    }

    if (isSystemEmailSender(fromEmail)) {
        return { status: 'skipped_system_sender' };
    }

    if (await isEmailBlacklisted(fromEmail)) {
        return { status: 'skipped_blacklist' };
    }

    const messageId = email.messageId?.trim() || null;
    let existingLogId: number | null = null;

    if (messageId && !options?.forceReProcess) {
        const existing = await prisma.floremoriaLog.findFirst({
            where: { keyPrompt: { contains: messageId } },
            select: { id: true },
        });
        if (existing) {
            return { status: 'skipped_duplicate', logId: existing.id };
        }
    } else if (messageId) {
        const existing = await prisma.floremoriaLog.findFirst({
            where: { keyPrompt: { contains: messageId } },
            select: { id: true },
        });
        if (existing) {
            existingLogId = existing.id;
        }
    }

    try {
        const draft = await classifyAndDraft({
            fromName: email.fromName || '',
            fromEmail,
            subject: email.subject || '',
            text: email.text || '',
        });

        const sendResult = await sendDirectReply(config, {
            fromAddress: config?.user || 'assistenza@floremoria.com',
            toAddress: fromEmail,
            subject: draft.subject,
            body: draft.body,
            inReplyToMessageId: messageId,
            references: email.references ?? undefined,
        });

        if (!sendResult.ok) {
            return { status: 'error', error: sendResult.error || 'Nessun provider di invio email disponibile.' };
        }

        const today = romeDateIso(new Date());
        const fullText = [
            `RISPOSTA AUTOMATICA INVIATA — assistenza@floremoria.com (Provider: ${sendResult.provider})`,
            `Da: ${email.fromName || ''} <${fromEmail}>`,
            `Categoria: ${draft.category} — ${draft.reasoning}`,
            `Oggetto: ${draft.subject}`,
            '',
            '--- Testo inviato (firma e messaggio originale inclusi) ---',
            draft.body,
        ].join('\n');

        let savedLogId = existingLogId;

        if (existingLogId) {
            await prisma.floremoriaLog.update({
                where: { id: existingLogId },
                data: {
                    sessionDate: new Date(),
                    tag: `#POSTMAN_ASSISTENZA_${today}, #${draft.category}`,
                    topic: email.subject || '(senza oggetto)',
                    shortSummary: draft.reasoning || `Risposta categoria ${draft.category} inviata con successo.`,
                    keyPrompt: `POSTMAN msgid:${messageId || `webhook-${fromEmail}-${today}`}`,
                    fullText,
                    discussedPoints: `Email da ${fromEmail} classificata ed inviata da Postman (categoria ${draft.category}).`,
                    achievedResults: `Risposta inviata direttamente a ${fromEmail} via ${sendResult.provider}.`,
                },
            });
        } else {
            const newLog = await prisma.floremoriaLog.create({
                data: {
                    sessionDate: new Date(),
                    tag: `#POSTMAN_ASSISTENZA_${today}, #${draft.category}`,
                    topic: email.subject || '(senza oggetto)',
                    shortSummary: draft.reasoning || `Risposta categoria ${draft.category} inviata.`,
                    keyPrompt: `POSTMAN msgid:${messageId || `webhook-${fromEmail}-${today}`}`,
                    fullText,
                    discussedPoints: `Email da ${fromEmail} classificata ed inviata da Postman (${draft.category}).`,
                    achievedResults: `Risposta inviata direttamente a ${fromEmail} via ${sendResult.provider}.`,
                    pendingTasks: null,
                    criticalAlarms: null,
                },
            });
            savedLogId = newLog.id;
        }

        return {
            status: 'reply_sent',
            category: draft.category,
            provider: sendResult.provider,
            logId: savedLogId || undefined,
        };
    } catch (e) {
        if (e instanceof PostmanConfigError) {
            throw e;
        }
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[postman] Errore elaborazione email assistenza:', msg);
        return { status: 'error', error: msg };
    }
}
