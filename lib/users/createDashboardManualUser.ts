import { UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';
import { createDeceasedManual } from '@/lib/deceased/registerOrphanDeceased';
import { setDeceasedFlorist } from '@/lib/deceased/setDeceasedFlorist';
import { findUserByEmail, findUserByPhone } from '@/lib/auth/identity';
import { phoneCore, toE164 } from '@/lib/auth/phone';

export type ManualUserDeceasedInput = {
    fullName: string;
    cemeteryCity: string;
    cemeteryName?: string | null;
    verifiedNotes?: string | null;
    partnerId?: string | null;
};

export type CreateDashboardManualUserInput = {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    deceased: ManualUserDeceasedInput[];
};

export type CreateDashboardManualUserResult = {
    userId: string;
    email: string;
    deceasedProfileIds: string[];
};

export async function createDashboardManualUser(
    input: CreateDashboardManualUserInput
): Promise<CreateDashboardManualUserResult> {
    const name = input.name?.trim() || null;
    const emailRaw = input.email?.trim().toLowerCase() || null;
    const phoneRaw = input.phone?.trim() || null;

    if (!emailRaw && !phoneRaw) {
        throw new Error('Email o telefono obbligatori.');
    }

    const deceasedRows = (input.deceased || []).filter(
        (d) => d.fullName?.trim() && d.cemeteryCity?.trim()
    );
    if (deceasedRows.length === 0) {
        throw new Error('Aggiungi almeno un defunto con nome e comune.');
    }

    let user =
        (emailRaw ? await findUserByEmail(emailRaw) : null) ||
        (phoneRaw ? await findUserByPhone(phoneRaw) : null);

    if (!user) {
        const phone = phoneRaw ? toE164(phoneRaw) || phoneRaw : null;
        const email =
            emailRaw ||
            `utente-${phoneCore(phoneRaw || String(Date.now()))}@phone.floremoria.local`;

        user = await prisma.user.create({
            data: {
                email,
                name,
                phone,
                systemRole: UserRole.USER,
                isActive: true,
            },
        });
    } else if (name || phoneRaw) {
        user = await prisma.user.update({
            where: { id: user.id },
            data: {
                ...(name ? { name } : {}),
                ...(phoneRaw ? { phone: toE164(phoneRaw) || phoneRaw } : {}),
                systemRole: UserRole.USER,
                isActive: true,
            },
        });
    }

    const deceasedProfileIds: string[] = [];

    for (const row of deceasedRows) {
        const profileId = await createDeceasedManual({
            fullName: row.fullName.trim(),
            cemeteryCity: row.cemeteryCity.trim(),
            cemeteryName: row.cemeteryName?.trim() || null,
            verifiedNotes: row.verifiedNotes?.trim() || null,
        });

        await prisma.userDeceasedLink.upsert({
            where: {
                userId_deceasedProfileId: {
                    userId: user.id,
                    deceasedProfileId: profileId,
                },
            },
            create: {
                userId: user.id,
                deceasedProfileId: profileId,
            },
            update: {},
        });

        if (row.partnerId?.trim()) {
            await setDeceasedFlorist(profileId, row.partnerId.trim());
        }

        deceasedProfileIds.push(profileId);
    }

    return {
        userId: user.id,
        email: user.email,
        deceasedProfileIds,
    };
}
