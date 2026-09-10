/**
 * Import storico floremoria.eu → .com (solo anagrafica ordine + link TX).
 * Perché: percorso dedicato — zero Prima Nota, zero notifiche, zero orderNumber.
 */
import { OrderStatus, PaymentStatus, type Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';

export const EU_HISTORICAL_IMPORT_TAG = 'IMPORT_EU_HISTORICAL';

export type EuHistoricalLineInput = {
    productId: string;
    quantity: number;
    priceCents: number;
};

export type EuHistoricalOrderInput = {
    batchId: string;
    /** Data reale ordine (YYYY-MM-DD), usata come createdAt. */
    orderDateIso: string;
    totalPriceCents: number;
    buyerFullName: string | null;
    buyerEmail: string | null;
    buyerPhone: string | null;
    deceasedName: string;
    cemeteryName: string;
    cemeteryCity: string;
    gravePosition?: string | null;
    deliveryProvince?: string | null;
    additionalNote?: string | null;
    /** ID da salvare su Order.stripeTransactionId (txn_/stripe_eu_tx_/PayPal TX). */
    gatewayTransactionId: string;
    paymentMethodLabel: 'stripe_eu' | 'paypal' | 'stripe';
    /** Se Stripe: stripeId del movimento da aggiornare con orderId (link, non ledger). */
    stripeMovementStripeId?: string | null;
    lines: EuHistoricalLineInput[];
};

function parseOrderDateUtc(iso: string): Date {
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) throw new Error(`Data ordine non valida: ${iso}`);
    // Mezzogiorno UTC: evita drift di giorno su timezone Europe/Rome
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

/**
 * Crea un ordine storico .eu senza numero, senza ledger, senza notifiche.
 * Idempotente sul batch: se stripeTransactionId già presente → skip.
 */
export async function importEuHistoricalOrder(
    input: EuHistoricalOrderInput
): Promise<{ created: boolean; orderId: string; skipped?: string }> {
    // Perché: il registro corrispettivi matcha su id nudo PayPal (senza prefisso TX:)
    const txId = input.gatewayTransactionId
        .trim()
        .replace(/^TX:/i, '')
        .slice(0, 255);
    if (!txId) throw new Error('gatewayTransactionId obbligatorio');
    if (!input.lines.length) throw new Error('Almeno una riga prodotto');

    const existing = await prisma.order.findFirst({
        where: { stripeTransactionId: txId, deletedAt: null },
        select: { id: true, orderNumber: true },
    });
    if (existing) {
        return { created: false, orderId: existing.id, skipped: 'tx_already_linked' };
    }

    const linesSum = input.lines.reduce((s, l) => s + l.priceCents * l.quantity, 0);
    if (Math.abs(linesSum - input.totalPriceCents) > 1) {
        throw new Error(
            `Somma righe ${linesSum} ≠ totale ${input.totalPriceCents} (${input.buyerEmail} ${input.orderDateIso})`
        );
    }

    const createdAt = parseOrderDateUtc(input.orderDateIso);
    const noteParts = [
        `${EU_HISTORICAL_IMPORT_TAG}:${input.batchId}`,
        'source=floremoria.eu',
        'no_ledger=1',
        'no_notify=1',
        'no_order_number=1',
    ];
    if (input.additionalNote?.trim()) noteParts.push(input.additionalNote.trim());

    const data: Prisma.OrderCreateInput = {
        createdAt,
        updatedAt: createdAt,
        orderNumber: null,
        buyerFullName: input.buyerFullName,
        buyerEmail: input.buyerEmail?.toLowerCase() || null,
        customerPhone: input.buyerPhone,
        deceasedName: input.deceasedName || 'n.c.',
        cemeteryName: input.cemeteryName || 'n.c.',
        cemeteryCity: input.cemeteryCity || 'n.c.',
        gravePosition: input.gravePosition || null,
        deliveryProvince: (input.deliveryProvince || 'XX').slice(0, 2).toUpperCase(),
        totalPriceCents: input.totalPriceCents,
        partnerPaymentStatus: PaymentStatus.PAID,
        // COMPLETED + confirmationMessageSent: nessun Punto A/B / Vera
        status: OrderStatus.COMPLETED,
        confirmationMessageSent: true,
        isRecurring: false,
        isTest: false,
        stripeTransactionId: txId,
        paymentMethodLabel: input.paymentMethodLabel.slice(0, 64),
        additionalInstructions: noteParts.join(' | '),
        financeNotes: `batch=${input.batchId}; gateway=${txId}`,
        items: {
            create: input.lines.map((l) => ({
                productId: l.productId,
                quantity: l.quantity,
                priceCents: l.priceCents,
            })),
        },
    };

    const order = await prisma.order.create({ data, select: { id: true } });

    // Link soft sul movimento Stripe (non crea scritture contabili)
    if (input.stripeMovementStripeId?.trim()) {
        await prisma.stripeFinanceMovement.updateMany({
            where: {
                stripeId: input.stripeMovementStripeId.trim(),
                orderId: null,
            },
            data: { orderId: order.id },
        });
    }

    return { created: true, orderId: order.id };
}
