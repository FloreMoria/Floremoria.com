import {
    formatFloristCompensationEur,
    resolveListinoEntry,
    type OrderLineForListino,
} from '@/lib/pricing/listini';
import { resolveFloristCompensationCentsFromRetail } from '@/lib/pricing/floristRetailShare';

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

/**
 * Compenso fiorista: Tabella prezzi e margini (65% retail / accessori a 0),
 * poi listino fisso tombe/funebre come fallback.
 */
export function calculateFloristCompensation(
    orderItems: OrderLineForCompensation[],
    partnerNotes?: string | null
): FloristCompensationResult {
    // Se c'è un compenso specifico concordato presente nelle note interne del fiorista (es. "Compenso concordato: 18€" o "Compenso: 18")
    if (partnerNotes) {
        const match = partnerNotes.match(/compenso\s*(?:concordato|fiorista)?\s*(?::|=)?\s*(\d+)\s*(?:€|eur)?/i);
        if (match && match[1]) {
            const euros = parseInt(match[1], 10);
            if (!isNaN(euros) && euros > 0) {
                const partnerCents = euros * 100;
                return {
                    totalCents: partnerCents,
                    totalLabel: `${euros}€`,
                    lines: [{
                        productName: 'Compenso specifico partner concordato',
                        quantity: 1,
                        unitCents: partnerCents,
                        lineCents: partnerCents,
                        listinoLabel: 'Note profilo fiorista',
                    }],
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

        const fromRetail = resolveFloristCompensationCentsFromRetail({
            slug: item.product.slug,
            name: item.product.name,
            basePriceCents: item.product.basePriceCents,
        });

        if (fromRetail !== null) {
            const lineCents = fromRetail * qty;
            totalCents += lineCents;
            lines.push({
                productName: name,
                quantity: qty,
                unitCents: fromRetail,
                lineCents,
                listinoLabel: 'Tabella prezzi e margini',
            });
            continue;
        }

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
