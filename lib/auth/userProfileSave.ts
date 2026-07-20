import prisma from '@/lib/prisma';
import { buildSafeProfileUpdate } from '@/lib/auth/sessionUser';
import { applyUserEmailChange, UserEmailUpdateError } from '@/lib/auth/userEmailUpdate';
import { normalizeMagicLinkEmail } from '@/lib/auth/magicLink';
import type { User } from '@prisma/client';

export type SaveUserProfileInput = {
    user: User;
    body: Record<string, unknown>;
    allowEmailChange: boolean;
};

export type SaveUserProfileResult = {
    user: User;
    emailChanged: boolean;
};

/**
 * Salva campi profilo whitelisted e opzionalmente email.
 */
export async function saveUserProfileFields(
    input: SaveUserProfileInput
): Promise<SaveUserProfileResult> {
    const { user, body, allowEmailChange } = input;
    const updateData = buildSafeProfileUpdate(body);

    let emailChanged = false;

    if (allowEmailChange && typeof body.email === 'string') {
        const requestedEmail = normalizeMagicLinkEmail(body.email);
        const currentEmail = normalizeMagicLinkEmail(user.email);
        // Stessa email (anche solo casing diverso): non trattare come cambio → no conflitto / sessione rotta.
        if (requestedEmail && requestedEmail !== currentEmail) {
            await applyUserEmailChange({
                userId: user.id,
                previousEmail: user.email,
                newEmail: requestedEmail,
                name: (updateData.name ?? user.name) || null,
                phone: (updateData.phone ?? user.phone) || null,
            });
            emailChanged = true;
        }
    }

    const hasProfileFields = Object.keys(updateData).length > 0;
    let updated = user;

    if (hasProfileFields) {
        updated = await prisma.user.update({
            where: { id: user.id },
            data: updateData,
        });

        await prisma.order.updateMany({
            where: { userId: user.id },
            data: {
                ...(updateData.name ? { buyerFullName: updateData.name } : {}),
                ...(updateData.phone !== undefined ? { customerPhone: updateData.phone } : {}),
            },
        });
    } else if (emailChanged) {
        updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    }

    return { user: updated, emailChanged };
}

export { UserEmailUpdateError };
