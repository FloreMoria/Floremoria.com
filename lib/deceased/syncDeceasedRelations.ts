import prisma from '@/lib/prisma';
import { resolveDeceasedProfileForOrder } from '@/lib/deceased/deceasedProfileIdentity';

/**
 * Garantisce profilo defunto + link M2M User/Partner quando un ordine viene consolidato.
 */
export async function syncDeceasedRelationsForOrder(orderId: string): Promise<void> {
    const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: {
            id: true,
            userId: true,
            partnerId: true,
            deceasedProfileId: true,
            deceasedName: true,
            cemeteryCity: true,
            cemeteryName: true,
        },
    });
    if (!order) return;

    const profileId = await resolveDeceasedProfileForOrder({
        deceasedName: order.deceasedName,
        cemeteryCity: order.cemeteryCity,
        cemeteryName: order.cemeteryName,
    });

    if (order.deceasedProfileId !== profileId) {
        await prisma.order.update({
            where: { id: order.id },
            data: { deceasedProfileId: profileId },
        });
    }

    if (order.userId) {
        await prisma.userDeceasedLink.upsert({
            where: {
                userId_deceasedProfileId: {
                    userId: order.userId,
                    deceasedProfileId: profileId,
                },
            },
            create: {
                userId: order.userId,
                deceasedProfileId: profileId,
            },
            update: {},
        });
    }

    if (order.partnerId) {
        await prisma.partnerDeceasedAssignment.upsert({
            where: {
                partnerId_deceasedProfileId: {
                    partnerId: order.partnerId,
                    deceasedProfileId: profileId,
                },
            },
            create: {
                partnerId: order.partnerId,
                deceasedProfileId: profileId,
                isPrimary: true,
            },
            update: { isPrimary: true },
        });
    }
}
