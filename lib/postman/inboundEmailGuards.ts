/**
 * Guard anti-loop per POSTMAN / Resend inbound su assistenza@floremoria.com.
 *
 * Perché: risposte automatiche a se stessi o ad auto-reply creano storm email;
 * il debounce per mittente ferma i loop anche se gli header mancano.
 */

import prisma from '@/lib/prisma';
import { ASSISTENZA_EMAIL } from '@/lib/floremoriaLogFilters';
import { getAssistenzaInboundAddresses } from '@/lib/postman/resendReceiving';
import { isSystemEmailSender } from '@/lib/postman/systemSenders';

export type InboundEmailGuardReason =
    | 'self_mailbox'
    | 'system_sender'
    | 'auto_submitted'
    | 'rate_limited';

const RATE_LIMIT_MS = 60 * 60 * 1000; // 1 ora

/** Normalizza header email (case-insensitive). */
export function getHeaderValue(
    headers: Record<string, string | string[] | undefined> | null | undefined,
    name: string
): string {
    if (!headers) return '';
    const target = name.toLowerCase();
    for (const [key, raw] of Object.entries(headers)) {
        if (key.toLowerCase() !== target) continue;
        if (Array.isArray(raw)) return raw.join(' ').trim();
        return (raw || '').toString().trim();
    }
    return '';
}

/**
 * True se l'email è un auto-reply / bounce / mailer-daemon da non elaborare.
 * Header RFC: Auto-Submitted, X-Autoreply, X-Auto-Response-Suppress, Precedence.
 */
export function isAutoSubmittedEmail(
    headers?: Record<string, string | string[] | undefined> | null,
    subject?: string | null
): boolean {
    const autoSubmitted = getHeaderValue(headers, 'auto-submitted').toLowerCase();
    if (autoSubmitted && autoSubmitted !== 'no') return true;

    const xAutoreply = getHeaderValue(headers, 'x-autoreply').toLowerCase();
    if (xAutoreply && xAutoreply !== 'no') return true;

    const xAutorespond = getHeaderValue(headers, 'x-autorespond').toLowerCase();
    if (xAutorespond && xAutorespond !== 'no') return true;

    const precedence = getHeaderValue(headers, 'precedence').toLowerCase();
    if (precedence === 'bulk' || precedence === 'junk' || precedence === 'list' || precedence === 'auto_reply') {
        return true;
    }

    const suppress = getHeaderValue(headers, 'x-auto-response-suppress').toLowerCase();
    if (suppress.includes('all') || suppress.includes('autoreply')) return true;

    const subj = (subject || '').trim().toLowerCase();
    if (
        /^(auto[:\s-]?re(ply|sponse)|out of office|fuori ufficio|assenza|vacation reply|undeliverable|delivery status notification)/i.test(
            subj
        )
    ) {
        return true;
    }

    return false;
}

/** True se il mittente è la casella assistenza stessa (loop Resend ↔ se stessi). */
export function isAssistenzaSelfAddress(fromEmail: string): boolean {
    const email = fromEmail.trim().toLowerCase();
    if (!email) return false;
    if (email === ASSISTENZA_EMAIL) return true;
    return getAssistenzaInboundAddresses().includes(email);
}

/**
 * Max 1 risposta automatica POSTMAN per mittente ogni ora.
 * Usa i log FloremoriaLog creati da processAssistenzaInboundEmail.
 */
export async function hasRecentPostmanAutoReply(fromEmail: string): Promise<boolean> {
    const email = fromEmail.trim().toLowerCase();
    if (!email) return false;

    const since = new Date(Date.now() - RATE_LIMIT_MS);
    const recent = await prisma.floremoriaLog.findFirst({
        where: {
            sessionDate: { gte: since },
            AND: [
                { tag: { contains: 'POSTMAN_ASSISTENZA', mode: 'insensitive' } },
                {
                    OR: [
                        { discussedPoints: { contains: `Email da ${email}`, mode: 'insensitive' } },
                        { achievedResults: { contains: `a ${email}`, mode: 'insensitive' } },
                        { keyPrompt: { contains: `webhook-${email}`, mode: 'insensitive' } },
                        { fullText: { contains: `<${email}>`, mode: 'insensitive' } },
                    ],
                },
            ],
        },
        select: { id: true },
    });
    return Boolean(recent);
}

export async function evaluateInboundEmailGuards(input: {
    fromEmail: string;
    subject?: string | null;
    headers?: Record<string, string | string[] | undefined> | null;
}): Promise<{ allow: true } | { allow: false; reason: InboundEmailGuardReason }> {
    const fromEmail = input.fromEmail.trim().toLowerCase();

    if (isAssistenzaSelfAddress(fromEmail)) {
        return { allow: false, reason: 'self_mailbox' };
    }
    if (isSystemEmailSender(fromEmail)) {
        return { allow: false, reason: 'system_sender' };
    }
    if (isAutoSubmittedEmail(input.headers, input.subject)) {
        return { allow: false, reason: 'auto_submitted' };
    }
    if (await hasRecentPostmanAutoReply(fromEmail)) {
        return { allow: false, reason: 'rate_limited' };
    }
    return { allow: true };
}
