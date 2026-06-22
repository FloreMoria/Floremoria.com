/**
 * Blacklist mittenti per il risponditore email assistenza@ (VERA/POSTMAN).
 */
import prisma from '@/lib/prisma';

export function normalizeBlacklistEmail(raw: string): string {
    const trimmed = raw.trim().toLowerCase();
    const angle = trimmed.match(/<([^>]+)>/);
    if (angle?.[1]) return angle[1].trim().toLowerCase();
    return trimmed;
}

export function isValidEmailForBlacklist(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function isEmailBlacklisted(fromEmail: string): Promise<boolean> {
    const normalized = normalizeBlacklistEmail(fromEmail);
    if (!normalized) return false;

    const hit = await prisma.emailBlacklist.findUnique({
        where: { email: normalized },
        select: { id: true },
    });
    return Boolean(hit);
}

export async function listEmailBlacklist() {
    return prisma.emailBlacklist.findMany({
        orderBy: { createdAt: 'desc' },
        select: { id: true, email: true, createdAt: true },
    });
}

export async function addEmailToBlacklist(rawEmail: string) {
    const email = normalizeBlacklistEmail(rawEmail);
    if (!isValidEmailForBlacklist(email)) {
        throw new Error('Indirizzo email non valido.');
    }

    return prisma.emailBlacklist.upsert({
        where: { email },
        create: { email },
        update: {},
        select: { id: true, email: true, createdAt: true },
    });
}

export async function removeEmailFromBlacklist(id: string): Promise<boolean> {
    try {
        await prisma.emailBlacklist.delete({ where: { id } });
        return true;
    } catch {
        return false;
    }
}
