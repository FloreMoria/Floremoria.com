/**
 * Compat webhook Futuria legacy (custom_webhook nel workflow).
 * Preferire modalità workflow (tag) o api (invio diretto) in floristDeliveryLinkNotify.
 */
import { findFuturiaDuplicateContact, normalizeFuturiaPhone } from './client';
import {
    sendFloristDeliveryLinkWhatsApp,
    type FloristDeliveryLinkWhatsAppInput,
} from './sendFloristDeliveryLinkWhatsApp';

export interface FloristDeliveryLinkWebhookInput {
    contactId?: string | null;
    phone?: string | null;
    name?: string | null;
    codice_ordine?: string | null;
    nome_defunto?: string | null;
    cimitero?: string | null;
    comune_cimitero?: string | null;
    posizione_tomba?: string | null;
    data_consegna?: string | null;
    link_mini_app_consegna?: string | null;
}

export type FloristDeliveryLinkWebhookResult =
    | { ok: true; messageId?: string; deliveryStatus?: string }
    | { ok: false; skipped: string; deliveryError?: string };

async function resolveContactId(input: FloristDeliveryLinkWebhookInput): Promise<string | null> {
    const fromPayload = input.contactId?.trim();
    if (fromPayload) return fromPayload;

    const phone = normalizeFuturiaPhone(input.phone);
    if (!phone) return null;

    const existing = await findFuturiaDuplicateContact({ phone });
    return existing?.id ?? null;
}

export async function sendFloristDeliveryLinkWhatsAppFromWebhook(
    input: FloristDeliveryLinkWebhookInput
): Promise<FloristDeliveryLinkWebhookResult> {
    const phone = normalizeFuturiaPhone(input.phone);
    const link = input.link_mini_app_consegna?.trim();
    if (!phone || !link) {
        return { ok: false, skipped: !phone ? 'invalid_phone' : 'missing_delivery_url' };
    }

    const contactId = await resolveContactId(input);
    if (!contactId) {
        return { ok: false, skipped: 'contact_not_found' };
    }

    const payload: FloristDeliveryLinkWhatsAppInput = {
        contactId,
        phone,
        codice_ordine: input.codice_ordine,
        nome_defunto: input.nome_defunto,
        cimitero: input.cimitero,
        comune_cimitero: input.comune_cimitero,
        posizione_tomba: input.posizione_tomba,
        data_consegna: input.data_consegna,
        link_mini_app_consegna: link,
    };

    return sendFloristDeliveryLinkWhatsApp(payload);
}
