import type { Prisma } from '@prisma/client';

/** Casella assistenza — esclusa solo per log POSTMAN (email ricevute/inviate). */
export const ASSISTENZA_EMAIL = 'assistenza@floremoria.com';

/**
 * Condizione POSITIVA «questo log va nascosto».
 * Usare dentro NOT { ... } così i record con tag NULL restano visibili
 * (NOT + contains su NULL in SQL escluderebbe tutto il database).
 */
export function floremoriaLogExcludedWhere(): Prisma.FloremoriaLogWhereInput {
    return {
        OR: [
            {
                AND: [
                    { tag: { not: null } },
                    { tag: { contains: 'POSTMAN_ASSISTENZA', mode: 'insensitive' } },
                ],
            },
            {
                AND: [
                    { keyPrompt: { not: null } },
                    { keyPrompt: { contains: 'POSTMAN msgid:', mode: 'insensitive' } },
                ],
            },
            {
                discussedPoints: {
                    contains: `Email da ${ASSISTENZA_EMAIL}`,
                    mode: 'insensitive',
                },
            },
            {
                discussedPoints: {
                    contains: `<${ASSISTENZA_EMAIL}>`,
                    mode: 'insensitive',
                },
            },
            { topic: { equals: ASSISTENZA_EMAIL, mode: 'insensitive' } },
            { keyPrompt: { equals: ASSISTENZA_EMAIL, mode: 'insensitive' } },
        ],
    };
}

/** Include tutti i log operativi; esclude solo POSTMAN / email assistenza come mittente. */
export function floremoriaLogPublicWhere(
    extra?: Prisma.FloremoriaLogWhereInput
): Prisma.FloremoriaLogWhereInput {
    const base: Prisma.FloremoriaLogWhereInput = {
        NOT: floremoriaLogExcludedWhere(),
    };
    if (!extra) return base;
    return { AND: [base, extra] };
}

/** Dettaglio log: nascosto solo se corrisponde ai criteri di esclusione POSTMAN/assistenza. */
export function isLogHiddenFromDashboard(log: {
    tag?: string | null;
    topic?: string | null;
    shortSummary?: string | null;
    keyPrompt?: string | null;
    fullText?: string | null;
    discussedPoints?: string | null;
}): boolean {
    const tag = log.tag ?? '';
    const topic = log.topic ?? '';
    const keyPrompt = log.keyPrompt ?? '';
    const discussed = log.discussedPoints ?? '';

    if (tag.toUpperCase().includes('POSTMAN_ASSISTENZA')) return true;
    if (keyPrompt.includes('POSTMAN msgid:')) return true;
    if (topic.toLowerCase() === ASSISTENZA_EMAIL) return true;
    if (keyPrompt.toLowerCase() === ASSISTENZA_EMAIL) return true;
    if (discussed.toLowerCase().includes(`email da ${ASSISTENZA_EMAIL}`)) return true;
    if (discussed.includes(`<${ASSISTENZA_EMAIL}>`)) return true;

    return false;
}
