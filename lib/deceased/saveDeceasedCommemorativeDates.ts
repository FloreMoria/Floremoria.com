/**
 * Salva date commemorative sul DeceasedProfile (fonte primaria) + mirror sugli Order collegati.
 */
import prisma from '@/lib/prisma';
import { parseCommemorativeDate } from '@/lib/deceased/deceasedProfileFormUtils';
import { revalidatePath } from 'next/cache';

export type SaveDeceasedCommemorativeDatesInput = {
    deceasedProfileId: string;
    birthDate?: string | null;
    deathDate?: string | null;
};

export type SaveDeceasedCommemorativeDatesResult = {
    birthDate: string | null;
    deathDate: string | null;
};

function toIsoDate(value: Date | null | undefined): string | null {
    if (!value) return null;
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export async function saveDeceasedCommemorativeDates(
    input: SaveDeceasedCommemorativeDatesInput
): Promise<SaveDeceasedCommemorativeDatesResult> {
    const existing = await prisma.deceasedProfile.findUnique({
        where: { id: input.deceasedProfileId },
        select: { id: true, birthDate: true, deathDate: true },
    });
    if (!existing) {
        throw new Error('Defunto non trovato.');
    }

    const birthDate =
        input.birthDate !== undefined
            ? parseCommemorativeDate(input.birthDate)
            : undefined;
    const deathDate =
        input.deathDate !== undefined
            ? parseCommemorativeDate(input.deathDate)
            : undefined;

    if (birthDate === undefined && deathDate === undefined) {
        return {
            birthDate: toIsoDate(existing.birthDate),
            deathDate: toIsoDate(existing.deathDate),
        };
    }

    const profilePatch: { birthDate?: Date | null; deathDate?: Date | null } = {};
    const orderPatch: {
        deceasedBirthDate?: Date | null;
        deceasedDeathDate?: Date | null;
    } = {};

    if (birthDate !== undefined) {
        profilePatch.birthDate = birthDate;
        orderPatch.deceasedBirthDate = birthDate;
    }
    if (deathDate !== undefined) {
        profilePatch.deathDate = deathDate;
        orderPatch.deceasedDeathDate = deathDate;
    }

    await prisma.$transaction(async (tx) => {
        await tx.deceasedProfile.update({
            where: { id: input.deceasedProfileId },
            data: profilePatch,
        });
        await tx.order.updateMany({
            where: { deceasedProfileId: input.deceasedProfileId },
            data: orderPatch,
        });
    });

    revalidatePath('/dashboard/user');
    revalidatePath('/dashboard/defunti');

    const updated = await prisma.deceasedProfile.findUnique({
        where: { id: input.deceasedProfileId },
        select: { birthDate: true, deathDate: true },
    });

    return {
        birthDate: toIsoDate(updated?.birthDate),
        deathDate: toIsoDate(updated?.deathDate),
    };
}

/** L'utente può modificare le date solo se collegato al defunto (link o ordine). */
export async function userCanEditDeceasedProfile(
    userId: string,
    email: string,
    deceasedProfileId: string
): Promise<boolean> {
    const link = await prisma.userDeceasedLink.findUnique({
        where: {
            userId_deceasedProfileId: { userId, deceasedProfileId },
        },
        select: { id: true },
    });
    if (link) return true;

    const order = await prisma.order.findFirst({
        where: {
            deceasedProfileId,
            OR: [
                { userId },
                { buyerEmail: { equals: email, mode: 'insensitive' } },
            ],
        },
        select: { id: true },
    });
    return Boolean(order);
}
