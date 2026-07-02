import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';

export type OrderCategoryCode = 'FT' | 'FF' | 'FA' | 'FP';

const VALID_CATEGORIES = new Set<string>(['FT', 'FF', 'FA', 'FP']);

export function normalizeOrderCategory(orderCategory?: string | null): OrderCategoryCode {
    const c = (orderCategory || 'FT').trim().toUpperCase();
    if (VALID_CATEGORIES.has(c)) return c as OrderCategoryCode;
    return 'FT';
}

/** Due lettere maiuscole — stessa regola del checkout. */
export function normalizeDeliveryProvince(deliveryProvince?: string | null): string {
    const raw = (deliveryProvince || 'XX').trim().toUpperCase();
    const two = raw.substring(0, 2);
    return two.length === 2 ? two : 'XX';
}

/** Prefisso con trattino finale, es. `FT-RM-26-`. */
export function buildOrderNumberBasePattern(
    orderCategory: string,
    deliveryProvince: string,
    refDate = new Date()
): string {
    const prefix = normalizeOrderCategory(orderCategory);
    const prov = normalizeDeliveryProvince(deliveryProvince);
    const year = refDate.getFullYear().toString().slice(-2);
    return `${prefix}-${prov}-${year}-`;
}

type DbClient = Prisma.TransactionClient | typeof prisma;

function parseProgressiveFromOrderNumber(orderNumber: string, basePattern: string): number | null {
    if (!orderNumber.startsWith(basePattern)) return null;
    const suffix = orderNumber.slice(basePattern.length);
    const n = Number.parseInt(suffix, 10);
    return Number.isFinite(n) ? n : null;
}

/** Calcola il prossimo progressivo consultando checkout + ordini manuali (stesso store). */
async function computeNextProgressive(basePattern: string, db: DbClient): Promise<number> {
    const rows = await db.order.findMany({
        where: { orderNumber: { startsWith: basePattern } },
        select: { orderNumber: true },
        orderBy: { orderNumber: 'desc' },
        take: 100,
    });

    let max = 0;
    for (const row of rows) {
        if (!row.orderNumber) continue;
        const n = parseProgressiveFromOrderNumber(row.orderNumber, basePattern);
        if (n !== null && n > max) max = n;
    }
    return max + 1;
}

export function formatOrderNumber(basePattern: string, progressive: number): string {
    return `${basePattern}${progressive.toString().padStart(3, '0')}`;
}

/** Anteprima non riservata — usata in modale dashboard e documentazione. */
export async function peekNextOrderNumber(input: {
    orderCategory: string;
    deliveryProvince: string;
    refDate?: Date;
    tx?: Prisma.TransactionClient;
}): Promise<string> {
    const db = input.tx ?? prisma;
    const basePattern = buildOrderNumberBasePattern(
        input.orderCategory,
        input.deliveryProvince,
        input.refDate
    );
    const progressive = await computeNextProgressive(basePattern, db);
    return formatOrderNumber(basePattern, progressive);
}

export function isOrderNumberUniqueViolation(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002'
    );
}

/**
 * Allocazione definitiva dentro una transazione Prisma.
 * Checkout e dashboard manuale devono usare solo questa funzione.
 */
export async function allocateOrderNumberInTransaction(
    tx: Prisma.TransactionClient,
    orderCategory: string,
    deliveryProvince: string,
    refDate = new Date()
): Promise<string> {
    const basePattern = buildOrderNumberBasePattern(orderCategory, deliveryProvince, refDate);
    const progressive = await computeNextProgressive(basePattern, tx);
    return formatOrderNumber(basePattern, progressive);
}
