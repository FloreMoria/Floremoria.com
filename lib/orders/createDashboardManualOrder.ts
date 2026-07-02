import {
    OrderStatus,
    PaymentStatus,
    type Prisma,
} from '@prisma/client';
import prisma from '@/lib/prisma';
import { createUserFromOrder } from '@/lib/auth/identity';
import { syncDeceasedRelationsForOrder } from '@/lib/deceased/syncDeceasedRelations';
import { ensurePaidOrderEntities } from '@/lib/orders/ensurePaidOrderEntities';
import {
    allocateOrderNumberInTransaction,
    isOrderNumberUniqueViolation,
    normalizeDeliveryProvince,
    normalizeOrderCategory,
} from '@/lib/orders/orderNumber';

export const MANUAL_ORDER_IMPORT_TAG = 'IMPORT_MANUALE: dashboard admin';

export type CreateDashboardManualOrderInput = {
    orderCategory: string;
    deliveryProvince: string;
    buyerFullName?: string | null;
    buyerEmail?: string | null;
    buyerPhone?: string | null;
    deceasedName: string;
    deceasedBirthDate?: string | null;
    deceasedDeathDate?: string | null;
    cemeteryName: string;
    cemeteryCity: string;
    gravePosition?: string | null;
    deliveryDate?: string | null;
    productId: string;
    quantity?: number;
    priceCents?: number | null;
    partnerId?: string | null;
    userId?: string | null;
    deceasedProfileId?: string | null;
    status?: OrderStatus;
    partnerPaymentStatus?: PaymentStatus;
    isRecurring?: boolean;
    additionalInstructions?: string | null;
};

function parseOptionalDate(value?: string | null): Date | undefined {
    if (!value?.trim()) return undefined;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
        throw new Error(`Data non valida: ${value}`);
    }
    return d;
}

function buildManualInstructions(extra?: string | null): string {
    const parts = [MANUAL_ORDER_IMPORT_TAG];
    const trimmed = extra?.trim();
    if (trimmed) parts.push(trimmed);
    return parts.join(' | ');
}

async function resolveUserIdForManualOrder(
    input: CreateDashboardManualOrderInput
): Promise<string | null> {
    if (input.userId?.trim()) {
        const user = await prisma.user.findFirst({
            where: { id: input.userId.trim(), deletedAt: null },
            select: { id: true },
        });
        if (!user) throw new Error('Utente selezionato non trovato.');
        return user.id;
    }

    const email = input.buyerEmail?.trim().toLowerCase() || null;
    const phone = input.buyerPhone?.trim() || null;
    if (!email && !phone) return null;

    const draftOrder = {
        id: `manual-${Date.now()}`,
        buyerEmail: email,
        customerPhone: phone,
        buyerFullName: input.buyerFullName?.trim() || null,
    } as Parameters<typeof createUserFromOrder>[0];

    const created = await createUserFromOrder(draftOrder);
    return created?.id ?? null;
}

export async function createDashboardManualOrder(
    input: CreateDashboardManualOrderInput
) {
    const deceasedName = input.deceasedName?.trim();
    const cemeteryName = input.cemeteryName?.trim();
    const cemeteryCity = input.cemeteryCity?.trim();
    const productId = input.productId?.trim();

    if (!deceasedName) throw new Error('Nome defunto obbligatorio.');
    if (!cemeteryName) throw new Error('Nome cimitero obbligatorio.');
    if (!cemeteryCity) throw new Error('Comune cimitero obbligatorio.');
    if (!productId) throw new Error('Prodotto obbligatorio.');

    const email = input.buyerEmail?.trim().toLowerCase() || null;
    const phone = input.buyerPhone?.trim() || null;
    if (!email && !phone && !input.userId?.trim()) {
        throw new Error('Indica almeno email, telefono o un utente esistente.');
    }

    const product = await prisma.product.findFirst({
        where: { id: productId, deletedAt: null },
        select: { id: true, basePriceCents: true },
    });
    if (!product) throw new Error('Prodotto non trovato.');

    const quantity = Math.max(1, Number(input.quantity ?? 1));
    const unitPrice =
        input.priceCents != null && Number.isFinite(input.priceCents)
            ? Math.max(0, Math.round(input.priceCents))
            : product.basePriceCents;
    const totalPriceCents = unitPrice * quantity;

    const orderCategory = normalizeOrderCategory(input.orderCategory);
    const deliveryProvince = normalizeDeliveryProvince(input.deliveryProvince);
    const partnerPaymentStatus = input.partnerPaymentStatus ?? PaymentStatus.PAID;
    const status = input.status ?? OrderStatus.ACCEPTED;

    if (input.deceasedProfileId?.trim()) {
        const profile = await prisma.deceasedProfile.findUnique({
            where: { id: input.deceasedProfileId.trim() },
            select: { id: true },
        });
        if (!profile) throw new Error('Profilo defunto selezionato non trovato.');
    }

    if (input.partnerId?.trim()) {
        const partner = await prisma.partner.findFirst({
            where: { id: input.partnerId.trim(), deletedAt: null },
            select: { id: true },
        });
        if (!partner) throw new Error('Fiorista selezionato non trovato.');
    }

    const orderDataBase: Prisma.OrderCreateInput = {
        buyerFullName: input.buyerFullName?.trim() || null,
        buyerEmail: email,
        customerPhone: phone,
        deceasedName,
        deceasedBirthDate: parseOptionalDate(input.deceasedBirthDate),
        deceasedDeathDate: parseOptionalDate(input.deceasedDeathDate),
        cemeteryName,
        cemeteryCity,
        gravePosition: input.gravePosition?.trim() || null,
        deliveryProvince,
        deliveryDate: parseOptionalDate(input.deliveryDate),
        totalPriceCents,
        isRecurring: Boolean(input.isRecurring),
        partnerPaymentStatus,
        status,
        additionalInstructions: buildManualInstructions(input.additionalInstructions),
        ...(input.partnerId?.trim()
            ? { partner: { connect: { id: input.partnerId.trim() } } }
            : {}),
        ...(input.deceasedProfileId?.trim()
            ? { deceasedProfile: { connect: { id: input.deceasedProfileId.trim() } } }
            : {}),
        items: {
            create: {
                productId: product.id,
                quantity,
                priceCents: unitPrice,
            },
        },
    };

    const maxAttempts = 6;
    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
            const created = await prisma.$transaction(async (tx) => {
                const orderNumber = await allocateOrderNumberInTransaction(
                    tx,
                    orderCategory,
                    deliveryProvince
                );

                return tx.order.create({
                    data: {
                        ...orderDataBase,
                        orderNumber,
                    },
                });
            });

            let userId = input.userId?.trim() || null;
            if (!userId) {
                userId = await resolveUserIdForManualOrder(input);
                if (userId) {
                    await prisma.order.update({
                        where: { id: created.id },
                        data: { userId },
                    });
                }
            } else {
                await prisma.order.update({
                    where: { id: created.id },
                    data: { user: { connect: { id: userId } } },
                });
            }

            if (partnerPaymentStatus === PaymentStatus.PAID) {
                await ensurePaidOrderEntities(created.id);
            } else {
                await syncDeceasedRelationsForOrder(created.id);
            }

            return prisma.order.findUniqueOrThrow({
                where: { id: created.id },
                include: {
                    partner: true,
                    user: true,
                    items: { include: { product: true } },
                    deceasedProfile: true,
                },
            });
        } catch (error) {
            lastError = error;
            if (!isOrderNumberUniqueViolation(error)) throw error;
        }
    }

    throw lastError instanceof Error
        ? lastError
        : new Error('Impossibile creare ordine: collisione orderNumber.');
}
