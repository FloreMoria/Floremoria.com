/**
 * Futuria: upsert contatto fiorista + custom field link mini-app + tag workflow WhatsApp.
 * Pattern doppio passaggio (come magic photo): dati → tag `floremoria-invia-link-consegna-fiorista`.
 */
import { buildFloristDeliveryUrl } from '@/lib/orders/resolveOrderIdentifier';
import { isFuturiaConfigured, normalizeFuturiaPhone, upsertFuturiaContact } from './client';
import {
    getFuturiaFloristDeliveryLinkFieldKey,
    getFuturiaFloristDeliveryLinkTag,
} from './config';

export interface FloristDeliveryLinkNotifyInput {
    orderId: string;
    orderNumber?: string | null;
    deceasedName: string;
    cemeteryCity: string;
    cemeteryName?: string | null;
    gravePosition?: string | null;
    deliveryDate?: Date | null;
    partnerShopName: string;
    partnerOwnerName: string;
    partnerWhatsapp: string | null;
    partnerEmail?: string | null;
}

export type FloristDeliveryLinkNotifyResult =
    | { ok: true; contactId: string; deliveryUrl: string }
    | { ok: false; skipped: string };

/** Stati ordine che innescano l'invio del link consegna al fiorista (ASSEGNATO / IN CONSEGNA). */
export const FLORIST_DELIVERY_LINK_ORDER_STATUSES = ['IN_PROGRESS', 'DELIVERING'] as const;

export type FloristDeliveryLinkOrderStatus = (typeof FLORIST_DELIVERY_LINK_ORDER_STATUSES)[number];

export function shouldNotifyFloristDeliveryLink(
    previousStatus: string | null | undefined,
    nextStatus: string
): nextStatus is FloristDeliveryLinkOrderStatus {
    if (previousStatus === nextStatus) return false;
    return (FLORIST_DELIVERY_LINK_ORDER_STATUSES as readonly string[]).includes(nextStatus);
}

export async function sendFloristDeliveryLinkToFuturia(
    input: FloristDeliveryLinkNotifyInput
): Promise<FloristDeliveryLinkNotifyResult> {
    if (!isFuturiaConfigured()) {
        return { ok: false, skipped: 'futuria_not_configured' };
    }

    const phone = normalizeFuturiaPhone(input.partnerWhatsapp);
    if (!phone) {
        return { ok: false, skipped: 'invalid_partner_phone' };
    }

    const deliveryUrl = buildFloristDeliveryUrl({
        id: input.orderId,
        orderNumber: input.orderNumber,
    });
    const linkFieldKey = getFuturiaFloristDeliveryLinkFieldKey();
    const workflowTag = getFuturiaFloristDeliveryLinkTag();
    const partnerName = input.partnerShopName || input.partnerOwnerName;

    const contactId = await upsertFuturiaContact({
        phone,
        email: input.partnerEmail ?? undefined,
        name: partnerName,
        deceasedName: input.deceasedName,
        orderNumber: input.orderNumber,
        additionalCustomFields: {
            [linkFieldKey]: deliveryUrl,
            'contact.codice_ordine': input.orderNumber || input.orderId.slice(0, 8),
            'contact.nome_defunto': input.deceasedName,
            'contact.comune_cimitero': input.cemeteryCity,
            'contact.cimitero': input.cemeteryName || 'Non specificato',
            'contact.posizione_tomba': input.gravePosition || 'Non specificata',
            'contact.data_consegna': input.deliveryDate
                ? input.deliveryDate.toLocaleDateString('it-IT')
                : 'Da programmare',
        },
    });

    await upsertFuturiaContact({
        phone,
        name: partnerName,
        tags: [workflowTag],
    });

    console.info(
        `[florist-delivery-link] Futuria OK contact=${contactId} order=${input.orderNumber || input.orderId} url=${deliveryUrl}`
    );

    return { ok: true, contactId, deliveryUrl };
}
