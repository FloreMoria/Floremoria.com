/**
 * Allinea User + DeceasedProfile al primo pagamento confermato (Stripe).
 * Idempotente: non duplica anagrafiche già presenti, aggancia solo l'ordine.
 */
import { createUserFromOrder } from '@/lib/auth/identity';
import { syncDeceasedRelationsForOrder } from '@/lib/deceased/syncDeceasedRelations';
import prisma from '@/lib/prisma';

export interface EnsurePaidOrderEntitiesResult {
    userId: string | null;
    deceasedProfileId: string | null;
}

export async function ensurePaidOrderEntities(
    orderId: string
): Promise<EnsurePaidOrderEntitiesResult> {
    const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { id: true, userId: true, partnerPaymentStatus: true, deletedAt: true },
    });

    if (!order || order.deletedAt || order.partnerPaymentStatus !== 'PAID') {
        return { userId: null, deceasedProfileId: null };
    }

    if (!order.userId) {
        const fullOrder = await prisma.order.findUnique({ where: { id: orderId } });
        if (fullOrder) {
            const user = await createUserFromOrder(fullOrder);
            if (user) {
                await prisma.order.update({
                    where: { id: orderId },
                    data: { userId: user.id },
                });
            }
        }
    }

    await syncDeceasedRelationsForOrder(orderId);

    const updated = await prisma.order.findUnique({
        where: { id: orderId },
        select: { userId: true, deceasedProfileId: true },
    });

    return {
        userId: updated?.userId ?? null,
        deceasedProfileId: updated?.deceasedProfileId ?? null,
    };
}
