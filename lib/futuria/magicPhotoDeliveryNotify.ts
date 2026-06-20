/**
 * Futuria: upsert contatto post-consegna con custom field dinamici + tag workflow.
 * Gate: paid_order_followup (contatto esistente) o paid_order (primo sync).
 */
import {
    findFuturiaDuplicateContact,
    isFuturiaConfigured,
    normalizeFuturiaPhone,
    upsertFuturiaContact,
} from './client';
import {
    getFuturiaDeliveryCompletedTag,
    getFuturiaDeliveryCompletionFieldConfig,
} from './config';
import { resolveDeliveryFollowupContactAuth } from './contactGate';
import { resolvePartnerCity } from './proofOfDelivery';

export interface MagicPhotoDeliveryNotifyInput {
    orderId: string;
    orderNumber?: string | null;
    buyerFullName?: string | null;
    buyerEmail?: string | null;
    customerPhone?: string | null;
    deceasedName?: string | null;
    cemeteryCity?: string | null;
    cemeteryName?: string | null;
    deliveryProvince?: string | null;
    deliveredProductsSummary: string;
    magicLinkUrl: string;
    photoAfterUrl?: string | null;
}

function buildDeliveryCompletionCustomFields(input: MagicPhotoDeliveryNotifyInput): Record<string, string> {
    const fields = getFuturiaDeliveryCompletionFieldConfig();
    const deceasedName = (input.deceasedName || 'chi ama').trim();
    const cemeteryCity = resolvePartnerCity({
        cemeteryCity: input.cemeteryCity,
        cemeteryName: input.cemeteryName,
        deliveryProvince: input.deliveryProvince,
    });

    return {
        [fields.ultimoProdottoConsegnatoKey]: input.deliveredProductsSummary.trim(),
        [fields.ultimoDefuntoAssociatoKey]: deceasedName,
        [fields.ultimoCimiteroComuneKey]: cemeteryCity,
        [fields.ultimoMagicLinkKey]: input.magicLinkUrl.trim(),
    };
}

export async function sendMagicPhotoDeliveryToFuturia(
    input: MagicPhotoDeliveryNotifyInput
): Promise<{ ok: boolean; skipped?: string; contactId?: string }> {
    if (!isFuturiaConfigured()) {
        return { ok: false, skipped: 'futuria_not_configured' };
    }

    const phone = normalizeFuturiaPhone(input.customerPhone);
    if (!phone) {
        return { ok: false, skipped: 'invalid_phone' };
    }

    const buyerName = (input.buyerFullName || 'Utente').trim();
    const deliveryTag = getFuturiaDeliveryCompletedTag();
    const customFields = buildDeliveryCompletionCustomFields(input);

    const auth = await resolveDeliveryFollowupContactAuth({
        orderId: input.orderId,
        phone,
        email: input.buyerEmail,
    });

    const contactId = await upsertFuturiaContact(
        {
            phone,
            name: buyerName,
            ...(input.buyerEmail ? { email: input.buyerEmail } : {}),
            deceasedName: input.deceasedName,
            orderNumber: input.orderNumber,
            tags: [deliveryTag],
            additionalCustomFields: customFields,
        },
        auth
    );

    console.info(
        `[magic-photo-delivery] Futuria upsert OK contact=${contactId} order=${input.orderNumber || input.orderId} tag=${deliveryTag} auth=${auth.source}`
    );

    return { ok: true, contactId };
}

/** Solo per test: verifica presenza contatto prima dell'upsert. */
export async function findFuturiaContactForDeliveryNotify(params: {
    phone: string;
    email?: string | null;
}) {
    return findFuturiaDuplicateContact({
        phone: params.phone,
        email: params.email ?? undefined,
    });
}
