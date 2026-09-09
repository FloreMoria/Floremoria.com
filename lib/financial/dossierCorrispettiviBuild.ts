/**
 * Registro corrispettivi dossier — METODO v1.7 §8 / §8.3.
 * Una riga per ordine+aliquota; aliquota da Product.vatRatePercent (niente default nascosto).
 */
import { scorporaIva, VAT_PCT_FLORAL, VAT_PCT_ORDINARY } from '@/lib/financial/vat';
import type { DossierExceptionRow } from '@/lib/financial/dossierAcquistiBuild';

/** Stati di certezza aliquota (§8.3 + scomposizione mista richiesta in implementazione). */
export type CorrispettivoVatCertainty =
    | 'DETERMINATA'
    | 'MISTA'
    | 'PRESUNTA'
    | 'MANCANTE';

export type DossierCorrispettivoRow = {
    date: string;
    paymentDate: string;
    canaleIncasso: string;
    orderNumber: string;
    orderId: string;
    transactionId: string;
    listinoCents: number;
    scontoCents: number;
    grossCents: number;
    vatRate: number;
    imponibileCents: number;
    ivaCents: number;
    vatCertainty: CorrispettivoVatCertainty;
    vatRuleNote: string;
};

export type OrderItemForCorrispettivi = {
    quantity: number;
    priceCents: number;
    product: {
        vatRatePercent: number | null;
        name?: string | null;
        category?: { slug: string | null; name: string | null } | null;
    } | null;
};

export type OrderForCorrispettivi = {
    id: string;
    orderNumber: string | null;
    createdAt: Date;
    totalPriceCents: number;
    accessoryAmountCents: number | null;
    paymentMethodLabel: string | null;
    stripeTransactionId: string | null;
    buyerFullName: string | null;
    buyerEmail: string | null;
    items: OrderItemForCorrispettivi[];
};

function isEuPresuntaEligible(order: OrderForCorrispettivi, paymentDate: Date): boolean {
    // METODO §8.3: unica regola di presunzione — canale .eu fino al 01/07/2026 → 10%.
    const cutoff = new Date('2026-07-02T00:00:00.000Z');
    if (paymentDate >= cutoff) return false;
    const blob = `${order.paymentMethodLabel || ''} ${order.stripeTransactionId || ''}`.toLowerCase();
    return /floremoria\.eu|stripe_eu|\.eu\b|psa/.test(blob);
}

function productVatRate(item: OrderItemForCorrispettivi): number | null {
    const raw = item.product?.vatRatePercent;
    if (raw === 10 || raw === 22) return raw;
    if (raw != null && Number.isFinite(raw)) {
        const n = Math.round(raw > 0 && raw <= 1 ? raw * 100 : raw);
        if (n === 10 || n === 22) return n;
    }
    return null;
}

/**
 * Costruisce righe registro + eccezioni per ordini già arricchiti con incasso gateway.
 */
export function buildDossierCorrispettiviRows(input: {
    orders: Array<{
        order: OrderForCorrispettivi;
        grossCents: number;
        paymentDate: Date;
        gateway: string;
        transactionId: string;
        listinoCents?: number;
        scontoCents?: number;
    }>;
}): { rows: DossierCorrispettivoRow[]; exceptions: DossierExceptionRow[] } {
    const rows: DossierCorrispettivoRow[] = [];
    const exceptions: DossierExceptionRow[] = [];

    for (const entry of input.orders) {
        const { order, grossCents, paymentDate, gateway, transactionId } = entry;
        const listinoCents = entry.listinoCents ?? order.totalPriceCents;
        const scontoCents = entry.scontoCents ?? Math.max(0, listinoCents - Math.abs(grossCents));

        const priced = order.items.filter((it) => it.priceCents * it.quantity > 0);
        const byRate = new Map<number, number>();
        let missingRate = false;

        for (const it of priced) {
            const rate = productVatRate(it);
            if (rate == null) {
                missingRate = true;
                break;
            }
            const lineGross = it.priceCents * it.quantity;
            byRate.set(rate, (byRate.get(rate) || 0) + lineGross);
        }

        if (priced.length === 0 || missingRate || byRate.size === 0) {
            if (isEuPresuntaEligible(order, paymentDate)) {
                const vat = scorporaIva(grossCents, VAT_PCT_FLORAL);
                rows.push({
                    date: order.createdAt.toISOString().slice(0, 10),
                    paymentDate: paymentDate.toISOString().slice(0, 10),
                    canaleIncasso: gateway,
                    orderNumber: order.orderNumber || order.id.slice(0, 8),
                    orderId: order.id,
                    transactionId,
                    listinoCents,
                    scontoCents,
                    grossCents: vat.grossCents,
                    vatRate: VAT_PCT_FLORAL,
                    imponibileCents: vat.imponibileCents,
                    ivaCents: vat.ivaCents,
                    vatCertainty: 'PRESUNTA',
                    vatRuleNote: 'METODO §8.3 — canale .eu fino al 01/07/2026 aliquota 10%',
                });
                continue;
            }

            exceptions.push({
                cosa: `Corrispettivo senza aliquota determinata — ${order.orderNumber || order.id}`,
                dove: 'Registro corrispettivi §8.3',
                importoCents: Math.abs(grossCents),
                perche:
                    'Incasso senza vatRatePercent sugli articoli (o senza righe ordine): escluso dai totali IVA — non si applica default.',
            });
            rows.push({
                date: order.createdAt.toISOString().slice(0, 10),
                paymentDate: paymentDate.toISOString().slice(0, 10),
                canaleIncasso: gateway,
                orderNumber: order.orderNumber || order.id.slice(0, 8),
                orderId: order.id,
                transactionId,
                listinoCents,
                scontoCents,
                grossCents,
                vatRate: 0,
                imponibileCents: 0,
                ivaCents: 0,
                vatCertainty: 'MANCANTE',
                vatRuleNote: 'Escluso dai totali IVA — vedi Eccezioni',
            });
            continue;
        }

        const listinoSum = [...byRate.values()].reduce((a, b) => a + b, 0) || 1;
        const multi = byRate.size > 1;
        const certainty: CorrispettivoVatCertainty = multi ? 'MISTA' : 'DETERMINATA';

        for (const [rate, shareListino] of byRate) {
            const shareGross = Math.round((Math.abs(grossCents) * shareListino) / listinoSum);
            const signed = grossCents < 0 ? -shareGross : shareGross;
            const vat = scorporaIva(signed, rate);
            rows.push({
                date: order.createdAt.toISOString().slice(0, 10),
                paymentDate: paymentDate.toISOString().slice(0, 10),
                canaleIncasso: gateway,
                orderNumber: order.orderNumber || order.id.slice(0, 8),
                orderId: order.id,
                transactionId,
                listinoCents: shareListino,
                scontoCents: multi
                    ? Math.round((scontoCents * shareListino) / listinoSum)
                    : scontoCents,
                grossCents: vat.grossCents,
                vatRate: rate === VAT_PCT_ORDINARY ? VAT_PCT_ORDINARY : VAT_PCT_FLORAL,
                imponibileCents: vat.imponibileCents,
                ivaCents: vat.ivaCents,
                vatCertainty: certainty,
                vatRuleNote:
                    certainty === 'MISTA'
                        ? 'Ordine composito: riga per aliquota da Product.vatRatePercent'
                        : 'Aliquota da Product.vatRatePercent',
            });
        }
    }

    return { rows, exceptions };
}

/** Totali foglio 0: quanto fatturato per stato di certezza (solo righe con IVA ammessa). */
export function summarizeCorrispettiviVatCertainty(rows: DossierCorrispettivoRow[]) {
    const out = {
        determinataGrossCents: 0,
        mistaGrossCents: 0,
        presuntaGrossCents: 0,
        mancanteGrossCents: 0,
        ivaDebitoCents: 0,
        imponibileCents: 0,
    };
    for (const r of rows) {
        if (r.vatCertainty === 'MANCANTE') {
            out.mancanteGrossCents += Math.abs(r.grossCents);
            continue;
        }
        if (r.vatCertainty === 'DETERMINATA') out.determinataGrossCents += Math.abs(r.grossCents);
        if (r.vatCertainty === 'MISTA') out.mistaGrossCents += Math.abs(r.grossCents);
        if (r.vatCertainty === 'PRESUNTA') out.presuntaGrossCents += Math.abs(r.grossCents);
        out.imponibileCents += r.imponibileCents;
        out.ivaDebitoCents += r.ivaCents;
    }
    return out;
}
