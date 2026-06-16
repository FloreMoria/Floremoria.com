import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { visibleDashboardOrdersWhere } from '@/lib/dashboardOrdersFilter';
import { syncDeceasedRelationsForOrder } from '@/lib/deceased/syncDeceasedRelations';
import { setDeceasedFlorist } from '@/lib/deceased/setDeceasedFlorist';

/** Registra un gruppo orfano (stesso nome + cimitero) creando il DeceasedProfile e collegando gli ordini. */
export async function registerOrphanDeceasedFromSeedOrder(seedOrderId: string): Promise<string> {
    const seed = await prisma.order.findFirst({
        where: {
            id: seedOrderId,
            deceasedProfileId: null,
            ...visibleDashboardOrdersWhere(),
        },
        select: {
            id: true,
            deceasedName: true,
            cemeteryCity: true,
            cemeteryName: true,
        },
    });

    if (!seed) {
        throw new Error('Ordine orfano non trovato o già registrato.');
    }

    const siblings = await prisma.order.findMany({
        where: {
            deceasedProfileId: null,
            deceasedName: seed.deceasedName,
            cemeteryCity: seed.cemeteryCity,
            cemeteryName: seed.cemeteryName,
            ...visibleDashboardOrdersWhere(),
        },
        select: { id: true },
    });

    let profile = await prisma.deceasedProfile.findFirst({
        where: {
            fullName: seed.deceasedName,
            cemeteryCity: seed.cemeteryCity,
        },
        select: { id: true },
    });

    if (!profile) {
        profile = await prisma.deceasedProfile.create({
            data: {
                fullName: seed.deceasedName,
                cemeteryCity: seed.cemeteryCity,
                cemeteryName: seed.cemeteryName,
            },
            select: { id: true },
        });
    }

    for (const order of siblings) {
        await prisma.order.update({
            where: { id: order.id },
            data: { deceasedProfileId: profile.id },
        });
        await syncDeceasedRelationsForOrder(order.id);
    }

    const latestWithPartner = await prisma.order.findFirst({
        where: { deceasedProfileId: profile.id, partnerId: { not: null }, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { partnerId: true },
    });

    if (latestWithPartner?.partnerId) {
        await setDeceasedFlorist(profile.id, latestWithPartner.partnerId);
    }

    revalidatePath('/dashboard/defunti');
    revalidatePath('/dashboard/users');

    return profile.id;
}

export type CreateDeceasedManualInput = {
    fullName: string;
    cemeteryCity: string;
    cemeteryName?: string | null;
    verifiedNotes?: string | null;
};

/** Inserimento manuale di un defunto senza ordine (anagrafica commemorativa). */
export async function createDeceasedManual(input: CreateDeceasedManualInput): Promise<string> {
    const fullName = input.fullName.trim();
    const cemeteryCity = input.cemeteryCity.trim();

    if (!fullName || !cemeteryCity) {
        throw new Error('Nome defunto e comune sono obbligatori.');
    }

    const profile = await prisma.deceasedProfile.create({
        data: {
            fullName,
            cemeteryCity,
            cemeteryName: input.cemeteryName?.trim() || null,
            verifiedNotes: input.verifiedNotes?.trim() || null,
        },
        select: { id: true },
    });

    revalidatePath('/dashboard/defunti');
    return profile.id;
}
