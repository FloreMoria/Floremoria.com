import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';

/**
 * Risolve un ordine da codice parlante (PT-UD-26-002) o ID interno Prisma.
 */
export async function resolveOrderByPublicRef<S extends Prisma.OrderSelect>(
    ref: string,
    select: S
): Promise<Prisma.OrderGetPayload<{ select: S }> | null> {
    const trimmed = ref.trim();
    if (!trimmed) return null;

    const upper = trimmed.toUpperCase();

    return prisma.order.findFirst({
        where: {
            deletedAt: null,
            OR: [{ id: trimmed }, { orderNumber: trimmed }, { orderNumber: upper }],
        },
        select,
    });
}

/** URL pubblico mini-app fiorista — preferisce il codice ordine parlante. */
export function buildFloristDeliveryPath(order: { id: string; orderNumber?: string | null }): string {
    const slug = order.orderNumber?.trim() || order.id;
    return `/fiorista/consegna/${encodeURIComponent(slug)}`;
}

export function buildFloristDeliveryUrl(
    order: { id: string; orderNumber?: string | null },
    baseUrl?: string
): string {
    const base = (
        baseUrl?.trim() ||
        process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
        process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
        'https://www.floremoria.com'
    ).replace(/\/$/, '');
    return `${base}${buildFloristDeliveryPath(order)}`;
}
