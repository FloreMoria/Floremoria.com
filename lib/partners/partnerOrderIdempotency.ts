/**
 * Idempotenza ordini B2B partner: stesso PaymentIntent / Idempotency-Key → stesso ordine.
 * Perché: retry Stripe/webhook dopo timeout non devono creare duplicati.
 * Non usa l’annuncio funebre: sullo stesso annuncio possono esserci più omaggi distinti.
 */
import type { Prisma, PrismaClient } from '@prisma/client';

export type PartnerIdempotencyKeys = {
    /** Chiave pagamento persistita su Order.stripeTransactionId (PI / session / Idempotency-Key). */
    paymentKey: string | null;
    /**
     * Annuncio esterno — salvato su Order.externalAnnouncementId a fini operativi,
     * mai usato per deduplica (più ordini legittimi sullo stesso annuncio).
     */
    externalOrderId: string | null;
};

type DbClient = PrismaClient | Prisma.TransactionClient;

function trimKey(v: unknown): string | null {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t.length > 0 ? t.slice(0, 255) : null;
}

/**
 * Estrae chiavi da header Idempotency-Key e body partner.
 * Solo `paymentKey` alimenta la deduplica; `externalOrderId` è solo metadato.
 */
export function extractPartnerIdempotencyKeys(
    request: Request,
    body: Record<string, unknown>
): PartnerIdempotencyKeys {
    const headerKey = trimKey(request.headers.get('Idempotency-Key'));
    const paymentKey =
        headerKey ||
        trimKey(body.paymentIntentId) ||
        trimKey(body.stripePaymentIntentId) ||
        trimKey(body.externalTransactionId) ||
        trimKey(body.stripeCheckoutSessionId) ||
        null;

    const externalOrderId =
        trimKey(body.externalOrderId) ||
        trimKey(body.annuncioId) ||
        trimKey(body.external_announcement_id) ||
        trimKey(body.externalAnnouncementId) ||
        null;

    return { paymentKey, externalOrderId };
}

const existingOrderSelect = {
    id: true,
    orderNumber: true,
    totalPriceCents: true,
    currency: true,
    agencyId: true,
    partnerId: true,
    referralPartnerId: true,
    partnershipChannel: true,
    partnerCommissionCents: true,
    partnerCommissionSettlementStatus: true,
    isTest: true,
    partnerPaymentStatus: true,
    paymentMethodLabel: true,
    stripeTransactionId: true,
    externalAnnouncementId: true,
} as const;

export type ExistingPartnerOrder = Prisma.OrderGetPayload<{ select: typeof existingOrderSelect }>;

/**
 * Cerca un ordine non cancellato già creato con la stessa chiave di pagamento.
 * Nessun match su externalAnnouncementId / annuncioId.
 */
export async function findExistingPartnerOrderByIdempotency(
    db: DbClient,
    keys: PartnerIdempotencyKeys
): Promise<ExistingPartnerOrder | null> {
    if (!keys.paymentKey) return null;

    return db.order.findFirst({
        where: {
            deletedAt: null,
            status: { not: 'CANCELLED' },
            OR: [
                { stripeTransactionId: keys.paymentKey },
                // Retrocompatibilità: PI/session storicamente solo in additionalInstructions JSON.
                { additionalInstructions: { contains: keys.paymentKey } },
            ],
        },
        orderBy: { createdAt: 'asc' },
        select: existingOrderSelect,
    });
}

/** Payload HTTP 200 per retry idempotente (compatibile con shape `data` storica). */
export function partnerDuplicateOrderResponseBody(order: ExistingPartnerOrder) {
    return {
        success: true,
        duplicate: true,
        orderId: order.id,
        code: order.orderNumber,
        data: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            totalPriceCents: order.totalPriceCents,
            currency: order.currency,
            agencyId: order.agencyId,
            partnerId: order.partnerId,
            referralPartnerId: order.referralPartnerId,
            partnershipChannel: order.partnershipChannel,
            partnerCommissionCents: order.partnerCommissionCents,
            partnerCommissionSettlementStatus: order.partnerCommissionSettlementStatus,
            isTest: order.isTest,
            partnerPaymentStatus: order.partnerPaymentStatus,
            paymentMethodLabel: order.paymentMethodLabel,
        },
    };
}
