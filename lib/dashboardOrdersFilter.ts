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

const abandonedCartWhere: Prisma.OrderWhereInput = {
    status: 'PENDING',
    partnerPaymentStatus: 'UNPAID',
    deletedAt: null,
};

export function isOrderCancelled(order: {
    status?: string | null;
    deletedAt?: Date | string | null;
}): boolean {
    return order.status === 'CANCELLED' || Boolean(order.deletedAt);
}

/**
 * Ordini attivi in dashboard (fioristi, utenti, overview, defunti, API partner).
 * Esclude checkout abbandonati e ordini annullati.
 * @param testModeActive — se definito, mostra solo record test (true) o produzione (false).
 */
export function visibleDashboardOrdersWhere(testModeActive?: boolean): Prisma.OrderWhereInput {
    const emailFilter = excludedBuyerEmailWhere();

    const base: Prisma.OrderWhereInput = {
        deletedAt: null,
        status: { not: 'CANCELLED' },
        NOT: abandonedCartWhere,
        ...(emailFilter ?? {}),
    };

    if (testModeActive !== undefined) {
        return { ...base, isTest: testModeActive };
    }

    return base;
}

/**
 * Pagina Ordini admin: include gli annullati (con evidenza visiva), esclude solo carrelli abbandonati.
 * @param testModeActive — se definito, mostra solo record test (true) o produzione (false).
 */
export function ordersListPageWhere(testModeActive?: boolean): Prisma.OrderWhereInput {
    const emailFilter = excludedBuyerEmailWhere();

    const base: Prisma.OrderWhereInput = {
        NOT: abandonedCartWhere,
        ...(emailFilter ?? {}),
    };

    if (testModeActive !== undefined) {
        return { ...base, isTest: testModeActive };
    }

    return base;
}

/** Ordini da archiviare (soft-delete): carrelli abbandonati e annullati. */
export function abandonedDashboardOrdersWhere(): Prisma.OrderWhereInput {
    return {
        deletedAt: null,
        OR: [abandonedCartWhere, { status: 'CANCELLED' }],
    };
}
