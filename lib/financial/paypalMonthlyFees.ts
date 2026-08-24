/**
 * Riepilogo mensile commissioni PayPal (fee trattenute) da Registro Neon.
 * Gemello operativo delle StripeServiceInvoice — aggregato, non fattura formale.
 */

import prisma from '@/lib/prisma';
import { parsePaypalSourceKey } from '@/lib/financial/paypalSourceKeys';

export type PaypalMonthlyFeeRow = {
    id: string;
    periodKey: string;
    number: string;
    issuedAt: string;
    periodStart: string;
    periodEnd: string;
    totalFeeCents: number;
    taxableFeeCents: number;
    vatReverseChargeCents: number;
    txnCount: number;
    vendorName: string;
    hasCsv: boolean;
};

function monthBounds(year: number, month0: number): { start: Date; end: Date; periodKey: string } {
    const start = new Date(year, month0, 1, 0, 0, 0, 0);
    const end = new Date(year, month0 + 1, 0, 23, 59, 59, 999);
    const periodKey = `${year}-${String(month0 + 1).padStart(2, '0')}`;
    return { start, end, periodKey };
}

/**
 * Aggrega fee PayPal per mese nel periodo [from, to].
 * Fonti: PAYPAL_FEE:* su FinancialLedgerEntry + metadata feeCents su TX.
 */
export async function buildPaypalMonthlyFeeRows(params: {
    from: Date;
    to: Date;
}): Promise<PaypalMonthlyFeeRow[]> {
    const entries = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceType: 'PAYPAL_MOVEMENT',
            accountingDate: { gte: params.from, lte: params.to },
            OR: [
                { sourceKey: { startsWith: 'PAYPAL_FEE:' } },
                { category: 'ONERI_BANCARI' },
            ],
        },
        select: {
            sourceKey: true,
            accountingDate: true,
            totalCents: true,
            metadataJson: true,
        },
        take: 5000,
    });

    const byMonth = new Map<string, { feeCents: number; txnIds: Set<string>; lastDate: Date }>();

    for (const e of entries) {
        const parsed = parsePaypalSourceKey(e.sourceKey || '');
        const isFee =
            parsed?.kind === 'FEE' ||
            (e.sourceKey || '').toUpperCase().startsWith('PAYPAL_FEE:');
        const meta = (e.metadataJson && typeof e.metadataJson === 'object'
            ? e.metadataJson
            : {}) as { feeCents?: number };
        let fee = 0;
        if (isFee) {
            fee = Math.abs(e.totalCents || 0);
        } else if (typeof meta.feeCents === 'number' && meta.feeCents > 0) {
            fee = Math.abs(meta.feeCents);
        } else {
            continue;
        }
        if (fee <= 0) continue;

        const d = e.accountingDate;
        const periodKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const txId = parsed?.transactionId || e.sourceKey || periodKey;
        const prev = byMonth.get(periodKey) || {
            feeCents: 0,
            txnIds: new Set<string>(),
            lastDate: d,
        };
        prev.feeCents += fee;
        prev.txnIds.add(txId);
        if (d > prev.lastDate) prev.lastDate = d;
        byMonth.set(periodKey, prev);
    }

    const rows: PaypalMonthlyFeeRow[] = [];
    for (const [periodKey, agg] of [...byMonth.entries()].sort((a, b) =>
        a[0].localeCompare(b[0])
    )) {
        const [y, m] = periodKey.split('-').map(Number);
        const { start, end } = monthBounds(y, m - 1);
        if (end < params.from || start > params.to) continue;
        const taxable = agg.feeCents;
        const vatRc = Math.round((taxable * 22) / 100);
        rows.push({
            id: `paypal-fee-${periodKey}`,
            periodKey,
            number: `PP-FEE-${periodKey}`,
            issuedAt: end.toISOString().slice(0, 10),
            periodStart: start.toISOString().slice(0, 10),
            periodEnd: end.toISOString().slice(0, 10),
            totalFeeCents: taxable,
            taxableFeeCents: taxable,
            vatReverseChargeCents: vatRc,
            txnCount: agg.txnIds.size,
            vendorName: 'PayPal (Europe) S.à r.l. et Cie, S.C.A.',
            hasCsv: true,
        });
    }

    return rows;
}

export function buildPaypalMonthlyFeesCsv(rows: PaypalMonthlyFeeRow[]): string {
    const sep = ';';
    const lines = [
        ['Periodo', 'Numero', 'Fine periodo', 'N. TX', 'Fee EUR', 'Imponibile', 'IVA RC 22%'].join(
            sep
        ),
    ];
    for (const r of rows) {
        lines.push(
            [
                r.periodKey,
                r.number,
                r.issuedAt,
                String(r.txnCount),
                (r.totalFeeCents / 100).toFixed(2).replace('.', ','),
                (r.taxableFeeCents / 100).toFixed(2).replace('.', ','),
                (r.vatReverseChargeCents / 100).toFixed(2).replace('.', ','),
            ].join(sep)
        );
    }
    const total = rows.reduce((s, r) => s + r.totalFeeCents, 0);
    lines.push(['TOTALE', '', '', '', (total / 100).toFixed(2).replace('.', ','), '', ''].join(sep));
    return '\uFEFF' + lines.join('\n');
}
