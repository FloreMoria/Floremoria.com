/**
 * Invio email transazionali via Futuria CRM API v2.
 * Usato da lib/serverMail.ts come provider primario quando configurato.
 */
import type { SendFloremMailParams } from '@/lib/serverMail';
import { parseFloremMailFromAddress } from './config';
import {
    ensureFuturiaContactForRecipient,
    FuturiaApiError,
    isFuturiaConfigured,
    sendFuturiaEmail,
} from './client';

function asList(v: string | string[] | undefined): string[] | undefined {
    if (!v) return undefined;
    return Array.isArray(v) ? v : [v];
}

/**
 * Instrada un'email transazionale su Futuria (upsert contatto + POST /conversations/messages).
 * Ritorna ok:false se Futuria non è configurato o se almeno un destinatario fallisce.
 */
export async function sendViaFuturia(
    fromHeader: string,
    params: SendFloremMailParams
): Promise<{ ok: boolean; error?: string; channel?: 'futuria' }> {
    if (!isFuturiaConfigured()) {
        return { ok: false, error: 'missing_futuria' };
    }

    const to = asList(params.to);
    if (!to?.length) return { ok: false, error: 'missing_to' };

    const emailFrom = parseFloremMailFromAddress(fromHeader);
    const bcc = asList(params.bcc);
    const errors: string[] = [];

    for (const recipient of to) {
        const normalized = recipient.trim().toLowerCase();
        if (!normalized.includes('@')) {
            errors.push(`invalid_email:${recipient}`);
            continue;
        }

        try {
            const contactId = await ensureFuturiaContactForRecipient(normalized);
            if (!contactId) {
                errors.push(`${normalized}: futuria_contact_not_found`);
                continue;
            }
            await sendFuturiaEmail({
                contactId,
                emailFrom,
                subject: params.subject,
                html: params.html,
                text: params.text,
                emailBcc: bcc,
                replyTo: params.replyTo,
            });
        } catch (e) {
            const msg =
                e instanceof FuturiaApiError
                    ? `${e.message}${e.body ? ` — ${e.body}` : ''}`
                    : e instanceof Error
                      ? e.message
                      : String(e);
            errors.push(`${normalized}: ${msg}`);
        }
    }

    if (errors.length) {
        return { ok: false, error: errors.join(' | '), channel: 'futuria' };
    }

    return { ok: true, channel: 'futuria' };
}
