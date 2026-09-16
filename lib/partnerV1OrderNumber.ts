import type { Prisma } from '@prisma/client';
import { allocateOrderNumberInTransaction } from '@/lib/orders/orderNumber';
import type { OrderCategoryCode } from '@/lib/orders/orderNumber';

/**
 * Numerazione tunnel Partner API v1.
 * - isTest=true → PT-{PROV}-{YY}-{NNN} (solo sandbox)
 * - live → FF/FT/FA/FP come il checkout, stesso contatore allocateOrderNumberInTransaction
 *
 * Contatore (leggibile senza indovinare):
 * Il progressivo è il massimo suffisso numerico già presente per lo stesso
 * `basePattern` (`{CAT}-{PROV}-{YY}-`) su Order.orderNumber, più uno, padded a 3.
 * FF-VE-26 e FT-VE-26 sono contatori indipendenti. Dopo FF-VE-26-001 il prossimo
 * funerale VE è FF-VE-26-002. PT- non entra mai nel contatore live.
 */
export async function generatePartnerTunnelOrderNumber(
    tx: Prisma.TransactionClient,
    deliveryProvince: string,
    opts: { isTest: boolean; orderCategory: OrderCategoryCode }
): Promise<string> {
    return allocateOrderNumberInTransaction(
        tx,
        opts.orderCategory,
        deliveryProvince,
        new Date(),
        { isTest: opts.isTest }
    );
}

/** Mappa categoria catalogo prodotto → prefisso ordine. */
export function orderCategoryFromProductSlug(slug: string | null | undefined): OrderCategoryCode {
    const s = (slug || '').toLowerCase();
    if (s.includes('funeral')) return 'FF';
    if (s.includes('animal')) return 'FA';
    if (s.includes('plant') || s.includes('pianta')) return 'FP';
    return 'FT';
}
