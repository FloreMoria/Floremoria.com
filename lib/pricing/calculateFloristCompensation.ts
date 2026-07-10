import {
    formatFloristCompensationEur,
    resolveListinoEntry,
    sumFloristCompensationCents,
    type OrderLineForListino,
} from '@/lib/pricing/listini';

export interface FloristCompensationResult {
    totalCents: number;
    totalLabel: string;
    lines: Array<{
        productName: string;
        quantity: number;
        unitCents: number;
        lineCents: number;
        listinoLabel: string;
    }>;
    unmappedProducts: string[];
}

export function calculateFloristCompensation(
    orderItems: OrderLineForListino[]
): FloristCompensationResult {
    const lines: FloristCompensationResult['lines'] = [];
    const unmappedProducts: string[] = [];

    for (const item of orderItems) {
        const entry = resolveListinoEntry(item.product.slug, item.product.name);
        const qty = Math.max(1, item.quantity);
        const name = item.product.name || item.product.slug || 'Prodotto';

        if (!entry) {
            unmappedProducts.push(name);
            continue;
        }

        lines.push({
            productName: name,
            quantity: qty,
            unitCents: entry.floristCents,
            lineCents: entry.floristCents * qty,
            listinoLabel: entry.label,
        });
    }

    const totalCents = sumFloristCompensationCents(orderItems);
  if (unmappedProducts.length) {
        console.warn(
            '[listino] Prodotti senza voce listino fiorista:',
            unmappedProducts.join(', ')
        );
    }

    return {
        totalCents,
        totalLabel: formatFloristCompensationEur(totalCents),
        lines,
        unmappedProducts,
    };
}

/** Etichetta compenso per template WhatsApp: evita "0,00€" fuorviante se listino non mappato. */
export function formatFloristCompensationForTemplate(result: FloristCompensationResult): string {
    if (result.totalCents > 0) return result.totalLabel;
    if (result.unmappedProducts.length > 0) return 'da confermare in app';
    return result.totalLabel;
}
