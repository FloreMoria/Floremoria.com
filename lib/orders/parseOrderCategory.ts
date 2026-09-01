import { normalizeOrderCategory } from '@/lib/orders/orderNumber';

/** Estrae FF/FT/FA/FP dal prefisso del numero ordine (es. FT-RM-26-001). */
export function parseOrderCategoryFromNumber(orderNumber?: string | null): string {
    const prefix = orderNumber?.trim().split('-')[0];
    return normalizeOrderCategory(prefix);
}
