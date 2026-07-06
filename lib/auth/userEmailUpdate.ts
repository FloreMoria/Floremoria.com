import prisma from '@/lib/prisma';
import { normalizeMagicLinkEmail } from '@/lib/auth/magicLink';

export class UserEmailUpdateError extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
        super(message);
        this.name = 'UserEmailUpdateError';
        this.code = code;
    }
}

export function isValidUserEmailFormat(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Aggiorna email su Prisma (+ ordini collegati).
 */
export async function applyUserEmailChange(params: {
    userId: string;
    previousEmail: string;
    newEmail: string;
    name?: string | null;
    phone?: string | null;
}): Promise<{ emailChanged: boolean }> {
    const previousEmail = normalizeMagicLinkEmail(params.previousEmail);
    const newEmail = normalizeMagicLinkEmail(params.newEmail);

    if (!isValidUserEmailFormat(newEmail)) {
        throw new UserEmailUpdateError('invalid_email', 'Indirizzo email non valido.');
    }

    if (previousEmail === newEmail) {
        return { emailChanged: false };
    }

    const conflict = await prisma.user.findUnique({ where: { email: newEmail } });
    if (conflict && conflict.id !== params.userId) {
        throw new UserEmailUpdateError(
            'email_in_use',
            'Questo indirizzo email è già associato a un altro account.'
        );
    }

    await prisma.user.update({
        where: { id: params.userId },
        data: { email: newEmail },
    });

    await prisma.order.updateMany({
        where: {
            OR: [
                { userId: params.userId },
                { buyerEmail: { equals: previousEmail, mode: 'insensitive' } },
            ],
        },
        data: { buyerEmail: newEmail },
    });

    return { emailChanged: true };
}
