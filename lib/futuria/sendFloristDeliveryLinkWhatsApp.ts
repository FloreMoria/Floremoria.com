/**
 * Invio WhatsApp al fiorista con link mini-app via API Futuria.
 * Usato in modalità `api` o come fallback dal webhook Futuria (legacy).
 */
import {
    FuturiaApiError,
    isFuturiaConfigured,
    isSameAsBusinessWhatsAppPhone,
    normalizeFuturiaPhone,
    sendFuturiaWhatsApp,
    sendFuturiaWhatsAppCtaUrl,
} from './client';
import { getFuturiaFloristDeliveryLinkTemplateId } from './config';

export interface FloristDeliveryLinkWhatsAppInput {
    contactId: string;
    phone: string;
    codice_ordine?: string | null;
    nome_defunto?: string | null;
    cimitero?: string | null;
    comune_cimitero?: string | null;
    posizione_tomba?: string | null;
    data_consegna?: string | null;
    link_mini_app_consegna: string;
}

export type FloristDeliveryLinkWhatsAppResult =
    | { ok: true; messageId?: string; deliveryStatus?: string }
    | { ok: false; skipped: string; deliveryError?: string };

function buildFloristDeliveryMessageBody(input: FloristDeliveryLinkWhatsAppInput): string {
    const codice = input.codice_ordine?.trim() || '—';
    const defunto = input.nome_defunto?.trim() || '—';
    const cimitero = [input.cimitero?.trim(), input.comune_cimitero?.trim()]
        .filter(Boolean)
        .join(' / ') || 'Non specificato';
    const tomba = input.posizione_tomba?.trim() || 'Non specificata';
    const data = input.data_consegna?.trim() || 'Da programmare';

    return (
        `Nuovo incarico FloreMoria — ordine ${codice} per ${defunto}. ` +
        `Cimitero: ${cimitero}. Tomba: ${tomba}. Consegna: ${data}.`
    );
}

export async function sendFloristDeliveryLinkWhatsApp(
    input: FloristDeliveryLinkWhatsAppInput
): Promise<FloristDeliveryLinkWhatsAppResult> {
    if (!isFuturiaConfigured()) {
        return { ok: false, skipped: 'futuria_not_configured' };
    }

    const deliveryUrl = input.link_mini_app_consegna.trim();
    if (!deliveryUrl.startsWith('http')) {
        return { ok: false, skipped: 'missing_delivery_url' };
    }

    const phone = normalizeFuturiaPhone(input.phone);
    if (!phone) {
        return { ok: false, skipped: 'invalid_phone' };
    }
    if (isSameAsBusinessWhatsAppPhone(phone)) {
        return { ok: false, skipped: 'recipient_is_business_line' };
    }

    const body = buildFloristDeliveryMessageBody(input);
    const templateId = getFuturiaFloristDeliveryLinkTemplateId();

    try {
        if (templateId) {
            const send = await sendFuturiaWhatsApp({
                contactId: input.contactId,
                templateId,
                message: `${body} Apri la mini-app: ${deliveryUrl}`,
                toNumber: phone,
            });
            const failed =
                send.deliveryStatus?.toLowerCase() === 'failed' || Boolean(send.deliveryError?.trim());
            if (failed) {
                return { ok: false, skipped: 'delivery_failed', deliveryError: send.deliveryError };
            }
            return { ok: true, messageId: send.messageId, deliveryStatus: send.deliveryStatus };
        }

        try {
            const ctaSend = await sendFuturiaWhatsAppCtaUrl({
                contactId: input.contactId,
                body,
                buttonText: 'MINI-APP',
                url: deliveryUrl,
            });
            const ctaFailed =
                ctaSend.deliveryStatus?.toLowerCase() === 'failed' || Boolean(ctaSend.deliveryError?.trim());
            if (!ctaFailed && ctaSend.messageId) {
                return { ok: true, messageId: ctaSend.messageId, deliveryStatus: ctaSend.deliveryStatus };
            }
        } catch (ctaErr) {
            console.warn(
                '[florist-delivery-link] CTA non disponibile, fallback testo+link:',
                ctaErr instanceof Error ? ctaErr.message : ctaErr
            );
        }

        const fallbackSend = await sendFuturiaWhatsApp({
            contactId: input.contactId,
            message: `${body}\nApri la mini-app:\n${deliveryUrl}`,
            toNumber: phone,
        });
        const failed =
            fallbackSend.deliveryStatus?.toLowerCase() === 'failed' ||
            Boolean(fallbackSend.deliveryError?.trim());
        if (failed) {
            return { ok: false, skipped: 'delivery_failed', deliveryError: fallbackSend.deliveryError };
        }

        return {
            ok: true,
            messageId: fallbackSend.messageId,
            deliveryStatus: fallbackSend.deliveryStatus,
        };
    } catch (e) {
        const msg =
            e instanceof FuturiaApiError
                ? `${e.message}${e.body ? ` — ${e.body.slice(0, 300)}` : ''}`
                : e instanceof Error
                  ? e.message
                  : String(e);
        console.error('[florist-delivery-link] Invio WhatsApp fallito:', msg);
        return { ok: false, skipped: 'send_failed', deliveryError: msg };
    }
}
