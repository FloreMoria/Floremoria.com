import prisma from '@/lib/prisma';
import { classifyAndDraft, PostmanConfigError } from '@/lib/postman/agent';
import { isEmailBlacklisted } from '@/lib/postman/emailBlacklist';
import {
    getMailboxConfigFromEnv,
    sendDirectReply,
    type MailboxConfig,
} from '@/lib/postman/mailbox';

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
    | 'error';

export interface AssistenzaEmailProcessResult {
    status: AssistenzaEmailProcessStatus;
    category?: string;
    error?: string;
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
 * classifica con POSTMAN/Gemini e risponde via SMTP in thread.
 */
export async function processAssistenzaInboundEmail(
    email: AssistenzaEmailInput,
    config: MailboxConfig = getMailboxConfigFromEnv()
): Promise<AssistenzaEmailProcessResult> {
    const fromEmail = email.fromEmail?.trim().toLowerCase();
    if (!fromEmail || !fromEmail.includes('@')) {
        return { status: 'skipped_invalid', error: 'missing_from_email' };
    }

    if (await isEmailBlacklisted(fromEmail)) {
        return { status: 'skipped_blacklist' };
    }

    const messageId = email.messageId?.trim() || null;
    if (messageId) {
        const existing = await prisma.floremoriaLog.findFirst({
            where: { keyPrompt: { contains: messageId } },
            select: { id: true },
        });
        if (existing) {
            return { status: 'skipped_duplicate' };
        }
    }

    try {
        const draft = await classifyAndDraft({
            fromName: email.fromName || '',
            fromEmail,
            subject: email.subject || '',
            text: email.text || '',
        });

        await sendDirectReply(config, {
            fromAddress: config.user,
            toAddress: fromEmail,
            subject: draft.subject,
            body: draft.body,
            inReplyToMessageId: messageId,
            references: email.references ?? undefined,
        });

        const today = romeDateIso(new Date());
        const fullText = [
            `RISPOSTA AUTOMATICA INVIATA — assistenza@floremoria.com`,
            `Da: ${email.fromName || ''} <${fromEmail}>`,
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
                keyPrompt: `POSTMAN msgid:${messageId || `webhook-${fromEmail}-${today}`}`,
                fullText,
                discussedPoints: `Email da ${fromEmail} classificata come ${draft.category}.`,
                achievedResults: 'Risposta inviata direttamente al mittente via SMTP.',
                pendingTasks: null,
                criticalAlarms: null,
            },
        });

        return { status: 'reply_sent', category: draft.category };
    } catch (e) {
        if (e instanceof PostmanConfigError) {
            throw e;
        }
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[postman] Errore elaborazione email assistenza:', msg);
        return { status: 'error', error: msg };
    }
}
