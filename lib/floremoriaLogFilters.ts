import type { Prisma } from '@prisma/client';

/**
 * Due concetti distinti (non confonderli):
 *
 * 1. LOG POSTMAN — corrispondenza email assistenza (ricevute/bozze). Restano in DB ma
 *    NON compaiono in Overview / Log di Sistema (tag #POSTMAN_ASSISTENZA_*).
 *
 * 2. VERBALI — atti operativi (BARBARA/DEVIN). Restano SEMPRE visibili in dashboard,
 *    anche se nel testo compare assistenza@floremoria.com come contatto o riferimento.
 *    Non devono invece contenere thread di mail (vedi stripEmailCorrespondenceFromVerbale).
 */

/** Filtro unificato: esclude SOLO i log di sync email POSTMAN. */
export function floremoriaLogPublicWhere(
    extra?: Prisma.FloremoriaLogWhereInput
): Prisma.FloremoriaLogWhereInput {
    const base: Prisma.FloremoriaLogWhereInput = {
        NOT: {
            tag: { contains: 'POSTMAN_ASSISTENZA', mode: 'insensitive' },
        },
    };
    if (!extra) return base;
    return { AND: [base, extra] };
}

/** Dettaglio log: nascosto solo se è un record POSTMAN (email assistenza). */
export function isLogHiddenFromDashboard(log: { tag?: string | null }): boolean {
    return Boolean(log.tag?.toUpperCase().includes('POSTMAN_ASSISTENZA'));
}
