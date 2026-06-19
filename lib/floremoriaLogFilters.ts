import type { Prisma } from '@prisma/client';

/** Casella assistenza — esclusa da overview, timeline e API log (POSTMAN). */
export const ASSISTENZA_EMAIL = 'assistenza@floremoria.com';

/** Campi dove l'email assistenza può essere valore esatto del record (non menzione nel corpo). */
const ASSISTENZA_EXACT_FIELDS = ['tag', 'topic', 'shortSummary', 'keyPrompt'] as const;

function assistenzaExcludeClauses(): Prisma.FloremoriaLogWhereInput[] {
    return [
        { tag: { contains: 'POSTMAN_ASSISTENZA', mode: 'insensitive' } },
        ...ASSISTENZA_EXACT_FIELDS.map((field) => ({
            [field]: { equals: ASSISTENZA_EMAIL, mode: 'insensitive' as const },
        })),
    ];
}

/** Filtro unificato per query dashboard/API log. */
export function floremoriaLogPublicWhere(
    extra?: Prisma.FloremoriaLogWhereInput
): Prisma.FloremoriaLogWhereInput {
    const base: Prisma.FloremoriaLogWhereInput = {
        NOT: {
            OR: assistenzaExcludeClauses(),
        },
    };
    if (!extra) return base;
    return { AND: [base, extra] };
}

/** Blocca dettaglio log assistenza POSTMAN o record la cui chiave è l'email assistenza. */
export function isLogHiddenFromDashboard(log: {
    tag?: string | null;
    topic?: string | null;
    shortSummary?: string | null;
    keyPrompt?: string | null;
}): boolean {
    if (log.tag?.toUpperCase().includes('POSTMAN_ASSISTENZA')) {
        return true;
    }
    const email = ASSISTENZA_EMAIL.toLowerCase();
    return ASSISTENZA_EXACT_FIELDS.some(
        (field) => log[field]?.trim().toLowerCase() === email
    );
}
