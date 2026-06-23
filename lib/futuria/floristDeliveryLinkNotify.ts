/**
 * Notifica link mini-app consegna al fiorista via Futuria.
 *
 * Modalità default `workflow` (come benvenuto utente e foto consegna):
 * upsert contatto + custom field → tag trigger → workflow Futuria invia WhatsApp.
 *
 * Modalità `api` (env FUTURIA_FLORIST_DELIVERY_SEND_MODE=api): invio diretto API Futuria,
 * senza workflow/tag trigger — utile se il builder Futuria non espone Send WhatsApp nativo.
 */
import { FLORIST_DELIVERY_PHOTO_INSTRUCTION } from '@/lib/orders/floristDeliveryLinkMessage';
import { buildFloristDeliveryUrl } from '@/lib/orders/resolveOrderIdentifier';
import { isFuturiaConfigured, normalizeFuturiaPhone, upsertFuturiaContact } from './client';
import {
    getFuturiaFloristDeliveryLinkFieldKey,
    getFuturiaFloristDeliveryLinkTag,
    getFuturiaFloristDeliverySendMode,
} from './config';
import { sendFloristDeliveryLinkWhatsApp } from './sendFloristDeliveryLinkWhatsApp';

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
    | { ok: true; contactId: string; deliveryUrl: string; channel: 'workflow' | 'api' }
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

/** Nuovo fiorista assegnato (o sostituito) — invia link mini-app con codice ordine. */
export function shouldNotifyFloristOnPartnerAssignment(
    previousPartnerId: string | null | undefined,
    nextPartnerId: string | null | undefined
): boolean {
    const next = nextPartnerId?.trim();
    if (!next) return false;
    return previousPartnerId?.trim() !== next;
}

/** Assegnazione fiorista o passaggio a IN_PROGRESS / DELIVERING. */
export function shouldNotifyFloristDeliveryLinkOnOrderUpdate(
    previous: { status?: string | null; partnerId?: string | null },
    next: { status?: string | null; partnerId?: string | null }
): boolean {
    const nextStatus = next.status ?? previous.status;
    if (
        nextStatus &&
        shouldNotifyFloristDeliveryLink(previous.status, nextStatus)
    ) {
        return true;
    }
    if (next.partnerId !== undefined) {
        return shouldNotifyFloristOnPartnerAssignment(previous.partnerId, next.partnerId);
    }
    return false;
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
    const deliveryDateLabel = input.deliveryDate
        ? input.deliveryDate.toLocaleDateString('it-IT')
        : 'Da programmare';

    const contactId = await upsertFuturiaContact(
        {
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
                'contact.data_consegna': deliveryDateLabel,
                'contact.raccomandazione_foto_consegna': FLORIST_DELIVERY_PHOTO_INSTRUCTION,
            },
        },
        { source: 'partner_florist' }
    );

    const sendMode = getFuturiaFloristDeliverySendMode();

    if (sendMode === 'api') {
        const sendResult = await sendFloristDeliveryLinkWhatsApp({
            contactId,
            phone,
            codice_ordine: input.orderNumber || input.orderId.slice(0, 8),
            nome_defunto: input.deceasedName,
            cimitero: input.cemeteryName || 'Non specificato',
            comune_cimitero: input.cemeteryCity,
            posizione_tomba: input.gravePosition || 'Non specificata',
            data_consegna: deliveryDateLabel,
            link_mini_app_consegna: deliveryUrl,
        });

        if (!sendResult.ok) {
            console.error(
                `[florist-delivery-link] Invio API fallito ordine ${input.orderNumber || input.orderId}:`,
                'skipped' in sendResult ? sendResult.skipped : 'unknown',
                'deliveryError' in sendResult ? sendResult.deliveryError : ''
            );
            return { ok: false, skipped: sendResult.skipped };
        }

        await upsertFuturiaContact(
            {
                phone,
                name: partnerName,
                tags: ['floremoria-link-inviato'],
            },
            { source: 'partner_florist' }
        );

        console.info(
            `[florist-delivery-link] WhatsApp API OK contact=${contactId} order=${input.orderNumber || input.orderId} url=${deliveryUrl}`
        );

        return { ok: true, contactId, deliveryUrl, channel: 'api' };
    }

    // Stesso pattern di benvenuto utente / foto consegna: tag → workflow Futuria
    await upsertFuturiaContact(
        {
            phone,
            name: partnerName,
            tags: [workflowTag],
        },
        { source: 'partner_florist' }
    );

    console.info(
        `[florist-delivery-link] Futuria workflow trigger OK contact=${contactId} order=${input.orderNumber || input.orderId} url=${deliveryUrl}`
    );

    return { ok: true, contactId, deliveryUrl, channel: 'workflow' };
}
