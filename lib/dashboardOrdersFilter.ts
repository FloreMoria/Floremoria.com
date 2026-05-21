import type { Prisma } from '@prisma/client';

/** Email parziali (es. salvatore@, @test.com) da escludere via env DASHBOARD_EXCLUDED_BUYER_EMAILS. */
export function getDashboardExcludedBuyerEmailFragments(): string[] {
    const raw = process.env.DASHBOARD_EXCLUDED_BUYER_EMAILS?.trim();
    if (!raw) return [];
    return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function excludedBuyerEmailWhere(): Prisma.OrderWhereInput | undefined {
    const fragments = getDashboardExcludedBuyerEmailFragments();
    if (fragments.length === 0) return undefined;

    return {
        NOT: {
            OR: fragments.map((fragment) => ({
                buyerEmail: { contains: fragment, mode: 'insensitive' as const },
            })),
        },
    };
}

/**
 * Ordini visibili in dashboard (Ordini, Overview, Utenti).
 * Esclude checkout abbandonati (PENDING + UNPAID), annullati e bozze soft-deleted.
 */
export function visibleDashboardOrdersWhere(): Prisma.OrderWhereInput {
    const emailFilter = excludedBuyerEmailWhere();

    return {
        deletedAt: null,
        status: { not: 'CANCELLED' },
        NOT: {
            status: 'PENDING',
            partnerPaymentStatus: 'UNPAID',
        },
        ...(emailFilter ?? {}),
    };
}

/** Ordini da archiviare (soft-delete): carrelli abbandonati e annullati. */
export function abandonedDashboardOrdersWhere(): Prisma.OrderWhereInput {
    return {
        deletedAt: null,
        OR: [
            {
                status: 'PENDING',
                partnerPaymentStatus: 'UNPAID',
            },
            { status: 'CANCELLED' },
        ],
    };
}
