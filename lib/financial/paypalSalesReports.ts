/**
 * Report vendite PayPal (conto HAYUMYJTWLRTE) come dato esterno di riconciliazione.
 * Fonte: CSV «Report sulle vendite» esportati da PayPal.
 *
 * T3 2026 è PROVVISORIO fino al 10/09 — ricaricare a fine trimestre.
 */
import fs from 'node:fs';
import path from 'node:path';

export const PAYPAL_MERCHANT_CODE = 'HAYUMYJTWLRTE' as const;

export const PAYPAL_SALES_REPORTS_DIR = path.join(
    process.cwd(),
    'docs/verbali/paypal-sales-reports'
);

export type PaypalSalesQuarter = 'T1' | 'T2' | 'T3' | 'YTD';

export type PaypalSalesReportMeta = {
    quarter: PaypalSalesQuarter;
    fileName: string;
    periodLabel: string;
    provisional: boolean;
    reloadNote: string | null;
    qty: number;
    volumeEuro: number;
};

/** Manifest ufficiale 11/09/2026 (allineato ai CSV in repo). */
export const PAYPAL_SALES_REPORT_MANIFEST: PaypalSalesReportMeta[] = [
    {
        quarter: 'T1',
        fileName: 'T1-2026.csv',
        periodLabel: '1 gen 2026 - 31 mar 2026',
        provisional: false,
        reloadNote: null,
        qty: 10,
        volumeEuro: 382.39,
    },
    {
        quarter: 'T2',
        fileName: 'T2-2026.csv',
        periodLabel: '1 apr 2026 - 30 giu 2026',
        provisional: false,
        reloadNote: null,
        qty: 8,
        volumeEuro: 321.85,
    },
    {
        quarter: 'T3',
        fileName: 'T3-2026-PROVVISORIO-1lug-10set.csv',
        periodLabel: '1 lug 2026 - 10 set 2026',
        provisional: true,
        reloadNote: 'PROVVISORIO: copre 1 lug – 10 set. A fine T3 ricaricare il report completo.',
        qty: 14,
        volumeEuro: 647.74,
    },
    {
        quarter: 'YTD',
        fileName: 'YTD-2026-01-01-2026-09-10.csv',
        periodLabel: '1 gen 2026 - 10 set 2026',
        provisional: true,
        reloadNote: 'Cumulativo fino al 10/09 (include T3 provvisorio).',
        qty: 32,
        volumeEuro: 1351.98,
    },
];

export type PaypalSalesDay = { date: string; qty: number; volumeCents: number };

export function parsePaypalSalesReportCsv(filePath: string): {
    merchant: string | null;
    period: string | null;
    daily: PaypalSalesDay[];
    qty: number;
    volumeCents: number;
} {
    const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    const delim = text.includes(';') ? ';' : ',';
    let merchant: string | null = null;
    let period: string | null = null;
    const daily: PaypalSalesDay[] = [];
    let inDaily = false;
    for (const line of text.split(/\r?\n/)) {
        const parts = line.split(delim).map((p) => p.trim());
        if (parts[0]?.startsWith('Codice commerciante')) merchant = parts[1] || null;
        if (parts[0]?.startsWith('Periodo')) period = parts[1] || null;
        if (parts[0] === 'Data' && (parts[1] || '').includes('Quantità')) {
            inDaily = true;
            continue;
        }
        if (!inDaily) continue;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(parts[0] || '')) {
            if ((parts[0] || '').startsWith('Totale') || (parts[0] || '').startsWith('Vendite')) {
                inDaily = false;
            }
            continue;
        }
        const qty = Math.round(parseFloat(parts[1] || '0') || 0);
        const volume = parseFloat((parts[2] || '0').replace(',', '.')) || 0;
        if (qty > 0) {
            daily.push({ date: parts[0]!, qty, volumeCents: Math.round(volume * 100) });
        }
    }
    return {
        merchant,
        period,
        daily,
        qty: daily.reduce((s, d) => s + d.qty, 0),
        volumeCents: daily.reduce((s, d) => s + d.volumeCents, 0),
    };
}

export function loadPaypalSalesReport(quarter: PaypalSalesQuarter) {
    const meta = PAYPAL_SALES_REPORT_MANIFEST.find((m) => m.quarter === quarter);
    if (!meta) throw new Error(`Unknown PayPal sales quarter: ${quarter}`);
    const filePath = path.join(PAYPAL_SALES_REPORTS_DIR, meta.fileName);
    const parsed = parsePaypalSalesReportCsv(filePath);
    return { meta, filePath, parsed };
}

/** Vendita 03/05/2026 €53,48 — Pay Later: per noi incasso immediato (PayPal finanzia il cliente). */
export const PAYPAL_PAY_LATER_KNOWN = {
    date: '2026-05-03',
    cents: 5348,
    txId: '1T757598T7263511M',
    buyerName: 'Maria Antonia Pozzi',
    note: 'Pay Later: trattare come incasso normale; liquidità immediata sul conto HAYUM.',
} as const;

export { isPaypalPayLaterLabel } from '@/lib/financial/paypalClassify';
