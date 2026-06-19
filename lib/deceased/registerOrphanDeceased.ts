import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { visibleDashboardOrdersWhere } from '@/lib/dashboardOrdersFilter';
import { syncDeceasedRelationsForOrder } from '@/lib/deceased/syncDeceasedRelations';
import {
    findMatchingDeceasedProfile,
    formatDeceasedIdentityField,
    normalizeDeceasedIdentityField,
    resolveDeceasedProfileForOrder,
} from '@/lib/deceased/deceasedProfileIdentity';
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
            cemeteryCity: { equals: seed.cemeteryCity, mode: 'insensitive' },
            ...visibleDashboardOrdersWhere(),
        },
        select: { id: true, deceasedName: true, cemeteryCity: true, cemeteryName: true },
    });

    const seedNameKey = normalizeDeceasedIdentityField(seed.deceasedName);
    const seedCityKey = normalizeDeceasedIdentityField(seed.cemeteryCity);
    const matchingSiblings = siblings.filter(
        (order) =>
            normalizeDeceasedIdentityField(order.deceasedName) === seedNameKey &&
            normalizeDeceasedIdentityField(order.cemeteryCity) === seedCityKey
    );

    const profileId = await resolveDeceasedProfileForOrder({
        deceasedName: seed.deceasedName,
        cemeteryCity: seed.cemeteryCity,
        cemeteryName: seed.cemeteryName,
    });

    for (const order of matchingSiblings) {
        await prisma.order.update({
            where: { id: order.id },
            data: { deceasedProfileId: profileId },
        });
        await syncDeceasedRelationsForOrder(order.id);
    }

    const latestWithPartner = await prisma.order.findFirst({
        where: { deceasedProfileId: profileId, partnerId: { not: null }, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { partnerId: true },
    });

    if (latestWithPartner?.partnerId) {
        await setDeceasedFlorist(profileId, latestWithPartner.partnerId);
    }

    revalidatePath('/dashboard/defunti');
    revalidatePath('/dashboard/users');

    return profileId;
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

    const existing = await findMatchingDeceasedProfile(fullName, cemeteryCity);
    if (existing) {
        revalidatePath('/dashboard/defunti');
        return existing.id;
    }

    const profile = await prisma.deceasedProfile.create({
        data: {
            fullName: formatDeceasedIdentityField(fullName),
            cemeteryCity: formatDeceasedIdentityField(cemeteryCity),
            cemeteryName: input.cemeteryName?.trim()
                ? formatDeceasedIdentityField(input.cemeteryName)
                : null,
            verifiedNotes: input.verifiedNotes?.trim() || null,
        },
        select: { id: true },
    });

    revalidatePath('/dashboard/defunti');
    return profile.id;
}
