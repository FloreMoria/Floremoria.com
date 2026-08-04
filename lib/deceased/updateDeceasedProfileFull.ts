/**
 * Aggiornamento anagrafica defunto + sync campi denormalizzati sugli ordini collegati.
 * Date nascita/morte: fonte primaria su DeceasedProfile, mirror su Order per storico.
 */
import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import {
    formatDeceasedIdentityField,
} from '@/lib/deceased/deceasedProfileIdentity';
import { getDeceasedProfileDetail, type DeceasedDetailPayload } from '@/lib/deceased/getDeceasedDetail';
import { setDeceasedFlorist } from '@/lib/deceased/setDeceasedFlorist';
import {
    composeFullName,
    composeGravePosition,
    parseCommemorativeDate,
} from '@/lib/deceased/deceasedProfileFormUtils';
import { sanitizePlannedDeliveryDates } from '@/lib/users/profileUserType';

export type DeceasedProfileUpdateInput = {
    firstName?: string | null;
    lastName?: string | null;
    fullName?: string | null;
    birthDate?: string | null;
    deathDate?: string | null;
    phone?: string | null;
    city?: string | null;
    cemeteryName?: string | null;
    cemeteryCity?: string | null;
    graveSector?: string | null;
    graveNumber?: string | null;
    gravePosition?: string | null;
    photoUrl?: string | null;
    coverUrl?: string | null;
    verifiedNotes?: string | null;
    partnerId?: string | null;
    plannedDeliveryDates?: string[] | null;
};

export async function updateDeceasedProfileFull(
    deceasedProfileId: string,
    input: DeceasedProfileUpdateInput
): Promise<DeceasedDetailPayload> {
    const existing = await prisma.deceasedProfile.findUnique({
        where: { id: deceasedProfileId },
        select: { id: true, fullName: true, cemeteryCity: true, cemeteryName: true, verifiedNotes: true, photoUrl: true, coverUrl: true, phone: true },
    });
    if (!existing) {
        throw new Error('Defunto non trovato.');
    }

    const fullName = composeFullName(input.firstName, input.lastName, input.fullName ?? existing.fullName);
    if (!fullName) {
        throw new Error('Nome e cognome del defunto sono obbligatori.');
    }

    const cityInput = input.city !== undefined ? input.city : input.cemeteryCity;
    const cemeteryCityRaw =
        cityInput !== undefined ? String(cityInput || '').trim() : existing.cemeteryCity;
    if (!cemeteryCityRaw) {
        throw new Error('Il comune / città di sepoltura è obbligatorio.');
    }

    const cemeteryNameRaw =
        input.cemeteryName !== undefined
            ? String(input.cemeteryName || '').trim() || null
            : existing.cemeteryName;

    const gravePosition =
        input.gravePosition !== undefined || input.graveSector !== undefined || input.graveNumber !== undefined
            ? composeGravePosition(input.graveSector, input.graveNumber, input.gravePosition)
            : undefined;

    const birthDate = parseCommemorativeDate(input.birthDate);
    const deathDate = parseCommemorativeDate(input.deathDate);

    const profileData: {
        fullName: string;
        cemeteryCity: string;
        cemeteryName: string | null;
        phone?: string | null;
        birthDate?: Date | null;
        deathDate?: Date | null;
        verifiedNotes?: string | null;
        photoUrl?: string | null;
        coverUrl?: string | null;
        plannedDeliveryDates?: string[];
    } = {
        fullName: formatDeceasedIdentityField(fullName),
        cemeteryCity: formatDeceasedIdentityField(cemeteryCityRaw),
        cemeteryName: cemeteryNameRaw
            ? formatDeceasedIdentityField(cemeteryNameRaw)
            : null,
    };

    if (input.phone !== undefined) {
        profileData.phone = input.phone?.trim() || null;
    }
    if (birthDate !== undefined) {
        profileData.birthDate = birthDate;
    }
    if (deathDate !== undefined) {
        profileData.deathDate = deathDate;
    }
    if (input.verifiedNotes !== undefined) {
        profileData.verifiedNotes = input.verifiedNotes?.trim() || null;
    }
    if (input.photoUrl !== undefined) {
        profileData.photoUrl = input.photoUrl?.trim() || null;
    }
    if (input.coverUrl !== undefined) {
        profileData.coverUrl = input.coverUrl?.trim() || null;
    }

    const plannedDeliveryDates =
        input.plannedDeliveryDates !== undefined
            ? sanitizePlannedDeliveryDates(input.plannedDeliveryDates)
            : undefined;
    if (plannedDeliveryDates !== undefined) {
        profileData.plannedDeliveryDates = plannedDeliveryDates;
    }

    await prisma.$transaction(async (tx) => {
        await tx.deceasedProfile.update({
            where: { id: deceasedProfileId },
            data: profileData,
        });

        // Order.cemeteryName è NOT NULL in schema: fallback stringa vuota se assente sul profilo.
        const orderPatch: {
            deceasedName: string;
            cemeteryCity: string;
            cemeteryName: string;
            gravePosition?: string | null;
            deceasedBirthDate?: Date | null;
            deceasedDeathDate?: Date | null;
        } = {
            deceasedName: profileData.fullName,
            cemeteryCity: profileData.cemeteryCity,
            cemeteryName: profileData.cemeteryName ?? '',
        };

        if (gravePosition !== undefined) {
            orderPatch.gravePosition = gravePosition;
        }
        if (birthDate !== undefined) {
            orderPatch.deceasedBirthDate = birthDate;
        }
        if (deathDate !== undefined) {
            orderPatch.deceasedDeathDate = deathDate;
        }

        await tx.order.updateMany({
            where: { deceasedProfileId },
            data: orderPatch,
        });

        // Sync date future sugli Utenti collegati (bacheca / reminder WhatsApp)
        if (plannedDeliveryDates !== undefined) {
            const links = await tx.userDeceasedLink.findMany({
                where: { deceasedProfileId },
                select: { userId: true },
            });
            const userIds = links.map((l) => l.userId);
            if (userIds.length > 0) {
                await tx.user.updateMany({
                    where: { id: { in: userIds } },
                    data: { plannedDeliveryDates },
                });
            }
        }
    });

    if (input.partnerId !== undefined) {
        const partnerId = String(input.partnerId || '').trim();
        if (partnerId) {
            await setDeceasedFlorist(deceasedProfileId, partnerId);
        }
    }

    revalidatePath('/dashboard/defunti');
    revalidatePath('/dashboard/users');

    const detail = await getDeceasedProfileDetail(deceasedProfileId);
    if (!detail) {
        throw new Error('Profilo aggiornato ma non leggibile.');
    }
    return detail;
}

export async function deleteDeceasedProfileSafe(deceasedProfileId: string): Promise<void> {
    const existing = await prisma.deceasedProfile.findUnique({
        where: { id: deceasedProfileId },
        select: { id: true },
    });
    if (!existing) {
        throw new Error('Defunto non trovato.');
    }

    await prisma.$transaction(async (tx) => {
        // Un-link ordini (non cancellare lo storico commemorativo degli ordini)
        await tx.order.updateMany({
            where: { deceasedProfileId },
            data: { deceasedProfileId: null },
        });
        await tx.userDeceasedLink.deleteMany({ where: { deceasedProfileId } });
        await tx.partnerDeceasedAssignment.deleteMany({ where: { deceasedProfileId } });
        await tx.deceasedProfile.delete({ where: { id: deceasedProfileId } });
    });

    revalidatePath('/dashboard/defunti');
    revalidatePath('/dashboard/users');
}

export async function linkUserToDeceased(params: {
    deceasedProfileId: string;
    userId: string;
    relationship?: string | null;
}): Promise<DeceasedDetailPayload> {
    const user = await prisma.user.findUnique({
        where: { id: params.userId },
        select: { id: true },
    });
    if (!user) throw new Error('Utente non trovato.');

    await prisma.userDeceasedLink.upsert({
        where: {
            userId_deceasedProfileId: {
                userId: params.userId,
                deceasedProfileId: params.deceasedProfileId,
            },
        },
        create: {
            userId: params.userId,
            deceasedProfileId: params.deceasedProfileId,
            relationship: params.relationship?.trim() || null,
        },
        update: {
            relationship: params.relationship?.trim() || null,
        },
    });

    revalidatePath('/dashboard/defunti');
    const detail = await getDeceasedProfileDetail(params.deceasedProfileId);
    if (!detail) throw new Error('Profilo non trovato dopo il collegamento.');
    return detail;
}

export async function linkOrderToDeceased(params: {
    deceasedProfileId: string;
    orderId: string;
}): Promise<DeceasedDetailPayload> {
    const profile = await prisma.deceasedProfile.findUnique({
        where: { id: params.deceasedProfileId },
        select: { id: true, fullName: true, cemeteryCity: true, cemeteryName: true },
    });
    if (!profile) throw new Error('Defunto non trovato.');

    const order = await prisma.order.findUnique({
        where: { id: params.orderId },
        select: { id: true },
    });
    if (!order) throw new Error('Ordine non trovato.');

    await prisma.order.update({
        where: { id: params.orderId },
        data: {
            deceasedProfileId: profile.id,
            deceasedName: profile.fullName,
            cemeteryCity: profile.cemeteryCity,
            cemeteryName: profile.cemeteryName ?? '',
        },
    });

    revalidatePath('/dashboard/defunti');
    const detail = await getDeceasedProfileDetail(params.deceasedProfileId);
    if (!detail) throw new Error('Profilo non trovato dopo il collegamento ordine.');
    return detail;
}
