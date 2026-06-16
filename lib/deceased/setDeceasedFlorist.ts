import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

/**
 * Un solo fiorista custode per defunto: sostituisce l'assegnazione esistente.
 * Aggiorna anche gli ordini attivi collegati al profilo.
 */
export async function setDeceasedFlorist(deceasedProfileId: string, partnerId: string): Promise<void> {
    const partner = await prisma.partner.findFirst({
        where: { id: partnerId, deletedAt: null, isB2B: false },
        select: { id: true },
    });

    if (!partner) {
        throw new Error('Fiorista non valido.');
    }

    const profile = await prisma.deceasedProfile.findUnique({
        where: { id: deceasedProfileId },
        select: { id: true },
    });

    if (!profile) {
        throw new Error('Profilo defunto non trovato.');
    }

    await prisma.$transaction(async (tx) => {
        await tx.partnerDeceasedAssignment.deleteMany({
            where: { deceasedProfileId },
        });

        await tx.partnerDeceasedAssignment.create({
            data: {
                deceasedProfileId,
                partnerId,
                isPrimary: true,
            },
        });

        await tx.order.updateMany({
            where: {
                deceasedProfileId,
                deletedAt: null,
                status: { in: ['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'DELIVERING'] },
            },
            data: { partnerId },
        });
    });

    revalidatePath('/dashboard/defunti');
    revalidatePath('/dashboard/orders');
    revalidatePath('/dashboard/fioristi');
}
