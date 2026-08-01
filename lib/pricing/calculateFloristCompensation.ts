/**
 * Compenso fiorista = somma rigida voci listino (mai percentuale sul retail).
 * Override solo se nelle note partner c'è un "Compenso concordato: N€".
 */
import {
    formatFloristCompensationEur,
    resolveListinoEntry,
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

export type OrderLineForCompensation = OrderLineForListino & {
    product: OrderLineForListino['product'] & { basePriceCents?: number | null };
};

export function calculateFloristCompensation(
    orderItems: OrderLineForCompensation[],
    partnerNotes?: string | null
): FloristCompensationResult {
    // Override esplicito da note interne fiorista (accordo one-off).
    if (partnerNotes) {
        const match = partnerNotes.match(
            /compenso\s*(?:concordato|fiorista)?\s*(?::|=)?\s*(\d+)\s*(?:€|eur)?/i
        );
        if (match?.[1]) {
            const euros = parseInt(match[1], 10);
            if (!Number.isNaN(euros) && euros > 0) {
                const partnerCents = euros * 100;
                return {
                    totalCents: partnerCents,
                    totalLabel: `${euros}€`,
                    lines: [
                        {
                            productName: 'Compenso specifico partner concordato',
                            quantity: 1,
                            unitCents: partnerCents,
                            lineCents: partnerCents,
                            listinoLabel: 'Note profilo fiorista',
                        },
                    ],
                    unmappedProducts: [],
                };
            }
        }
    }

    const lines: FloristCompensationResult['lines'] = [];
    const unmappedProducts: string[] = [];
    let totalCents = 0;

    for (const item of orderItems) {
        const qty = Math.max(1, item.quantity);
        const name = item.product.name || item.product.slug || 'Prodotto';

        const entry = resolveListinoEntry(item.product.slug, item.product.name, {
            isBouquet: item.product.isBouquet,
        });

        if (!entry) {
            unmappedProducts.push(name);
            continue;
        }

        const lineCents = entry.floristCents * qty;
        totalCents += lineCents;
        lines.push({
            productName: name,
            quantity: qty,
            unitCents: entry.floristCents,
            lineCents,
            listinoLabel: entry.label,
        });
    }

    if (unmappedProducts.length) {
        console.warn(
            '[listino] Prodotti senza voce listino fiorista (compenso 0 finché non mappati):',
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

/** Etichetta compenso per template WhatsApp. */
export function formatFloristCompensationForTemplate(result: FloristCompensationResult): string {
    if (result.totalCents > 0) return result.totalLabel;
    if (result.unmappedProducts.length > 0) return 'da confermare in app';
    return result.totalLabel;
}
