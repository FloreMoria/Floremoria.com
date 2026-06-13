/**
 * Dispatcher eventi webhook Futuria CRM → flussi FloreMoria.
 */
import prisma from '@/lib/prisma';
import { sendProofOfDeliveryNotification, type ProofOfDeliveryInput } from './proofOfDelivery';

/** Eventi riconosciuti (Futuria workflow / automazioni custom). */
export const FUTURIA_DELIVERY_PROOF_EVENTS = new Set([
    'delivery_proof_completed',
    'flower_placement_confirmed',
    'proof_of_delivery',
    'delivery.completed',
    'ConsegnaCompletata',
]);

export type FuturiaWebhookPayload = Record<string, unknown>;

export interface FuturiaWebhookHandleResult {
    handled: boolean;
    event?: string;
    action?: string;
    detail?: Record<string, unknown>;
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function resolveEventName(payload: FuturiaWebhookPayload): string | null {
    return (
        asString(payload.event) ||
        asString(payload.type) ||
        asString(payload.trigger) ||
        asString(payload.action) ||
        null
    );
}

function resolveNestedData(payload: FuturiaWebhookPayload): FuturiaWebhookPayload {
    const data = payload.data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        return data as FuturiaWebhookPayload;
    }
    const customData = payload.customData;
    if (customData && typeof customData === 'object' && !Array.isArray(customData)) {
        return customData as FuturiaWebhookPayload;
    }
    return payload;
}

async function loadOrderForProof(
    orderId: string | null,
    orderNumber: string | null
): Promise<ProofOfDeliveryInput | null> {
    if (!orderId && !orderNumber) return null;

    const order = await prisma.order.findFirst({
        where: {
            OR: [
                ...(orderId ? [{ id: orderId }] : []),
                ...(orderNumber ? [{ orderNumber }] : []),
            ],
        },
        include: { deliveryProof: true },
    });

    if (!order) return null;

    return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        buyerFullName: order.buyerFullName,
        buyerEmail: order.buyerEmail,
        customerPhone: order.customerPhone,
        deceasedName: order.deceasedName,
        cemeteryCity: order.cemeteryCity,
        cemeteryName: order.cemeteryName,
        deliveryProvince: order.deliveryProvince,
        photoAfterUrl: order.deliveryProof?.photoAfterUrl,
    };
}

/**
 * Gestisce un payload webhook Futuria. Ritorna handled:false se l'evento non è riconosciuto.
 */
export async function handleFuturiaWebhookPayload(
    payload: FuturiaWebhookPayload
): Promise<FuturiaWebhookHandleResult> {
    const event = resolveEventName(payload);
    const data = resolveNestedData(payload);

    const orderId = asString(data.orderId) || asString(data.order_id) || asString(payload.orderId);
    const orderNumber =
        asString(data.orderNumber) ||
        asString(data.order_number) ||
        asString(payload.orderNumber);

    const normalizedEvent = event?.toLowerCase().replace(/\s+/g, '_') ?? '';
    const floremAction = asString(data.floremAction) || asString(payload.floremAction);

    const isDeliveryProof =
        (event &&
            (FUTURIA_DELIVERY_PROOF_EVENTS.has(event) ||
                FUTURIA_DELIVERY_PROOF_EVENTS.has(normalizedEvent))) ||
        floremAction === 'proof_of_delivery';

    if (!isDeliveryProof) {
        return { handled: false, event: event ?? undefined };
    }

    if (!orderId && !orderNumber) {
        return {
            handled: true,
            event: event ?? 'delivery_proof',
            action: 'skipped_missing_order_ref',
        };
    }

    const proofInput = await loadOrderForProof(orderId, orderNumber);
    if (!proofInput) {
        return {
            handled: true,
            event: event ?? 'delivery_proof',
            action: 'skipped_order_not_found',
            detail: { orderId, orderNumber },
        };
    }

    const notifyResult = await sendProofOfDeliveryNotification(proofInput);

    return {
        handled: true,
        event: event ?? 'delivery_proof_completed',
        action: 'proof_of_delivery_notification',
        detail: {
            orderId: proofInput.orderId,
            orderNumber: proofInput.orderNumber,
            notifyOk: notifyResult.ok,
            skipped: notifyResult.skipped,
            messageId: notifyResult.messageId,
        },
    };
}
