/**
 * Export commercialista — 3 fogli soli (Registro Corrispettivi).
 * Fonte corrispettivi = stesso motore del dossier fiscale (buildTaxQuarterlyReport).
 * Zero PII cliente/defunto/destinatario.
 */
import ExcelJS from 'exceljs';
import { FLOREMORIA_LEGAL_ENTITY } from '@/lib/financial/companyBankDetails';
import {
    buildTaxQuarterlyReport,
    resolveQuarterBounds,
    resolveYearBounds,
    type TaxQuarter,
    type TaxQuarterlyReport,
} from '@/lib/financial/taxQuarterly';
import { listFloristMissingInvoices } from '@/lib/financial/floristMissingInvoices';

const EUR_FORMAT = '€ #,##0.00';
const DATE_FORMAT = 'DD/MM/YYYY';

const HEADER_FILL: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFDBEAFE' },
};

const HEADER_FONT: Partial<ExcelJS.Font> = {
    bold: true,
    color: { argb: 'FF1E3A5F' },
    size: 11,
    name: 'Calibri',
};

const THIN_BORDER: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFD6D3D1' } },
    left: { style: 'thin', color: { argb: 'FFD6D3D1' } },
    bottom: { style: 'thin', color: { argb: 'FFD6D3D1' } },
    right: { style: 'thin', color: { argb: 'FFD6D3D1' } },
};

/** Header/campi vietati (PII) — test build-breaker sullo stesso modello florist-privacy. */
export const COMMERCIALISTA_CORRISPETTIVI_FORBIDDEN_HEADERS = [
    'nome',
    'cognome',
    'email',
    'e-mail',
    'telefono',
    'indirizzo',
    'defunto',
    'destinatario',
    'buyer',
    'customer',
    'phone',
    'deceased',
    'recipient',
    'buyername',
    'buyeremail',
    'customerphone',
    'deceasedname',
    'buyerfullname',
] as const;

export type CommercialistaPeriod =
    | { kind: 'quarter'; year: number; quarter: TaxQuarter }
    | { kind: 'year'; year: number };

export type CommercialistaCorrispettiviTotals = {
    salesCount: number;
    imponibileCents: number;
    ivaDebitoCents: number;
    lordoCents: number;
    byRate: Array<{
        vatRate: number | null;
        salesCount: number;
        imponibileCents: number;
        ivaDebitoCents: number;
        lordoCents: number;
    }>;
};

export type CommercialistaCostiSenzaDocRow = {
    orderNumber: string;
    floristName: string;
    amountCents: number;
    deliveryDate: string;
};

export type CommercialistaCorrispettiviPreview = {
    filename: string;
    periodLabel: string;
    generatedAtIso: string;
    f1: CommercialistaCorrispettiviTotals;
    f2RowCount: number;
    f2: CommercialistaCorrispettiviTotals;
    f3RowCount: number;
    f3TotalCents: number;
    consistencyOk: true;
};

export class CommercialistaConsistencyError extends Error {
    readonly diffs: Array<{ voice: string; expectedCents: number; actualCents: number; deltaCents: number }>;

    constructor(
        diffs: Array<{ voice: string; expectedCents: number; actualCents: number; deltaCents: number }>
    ) {
        const detail = diffs
            .map(
                (d) =>
                    `${d.voice}: Δ €${(d.deltaCents / 100).toFixed(2)} (atteso ${(d.expectedCents / 100).toFixed(2)}, ottenuto ${(d.actualCents / 100).toFixed(2)})`
            )
            .join('; ');
        super(
            `I totali del Registro Corrispettivi non coincidono con il dossier fiscale per lo stesso periodo. ${detail}`
        );
        this.name = 'CommercialistaConsistencyError';
        this.diffs = diffs;
    }
}

function euroNum(cents: number): number {
    return Number((Number(cents) / 100).toFixed(2));
}

function parseYmd(ymd: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
}

function styleHeaderRow(row: ExcelJS.Row) {
    row.eachCell((cell) => {
        cell.fill = HEADER_FILL;
        cell.font = HEADER_FONT;
        cell.border = THIN_BORDER;
        cell.alignment = { vertical: 'middle', wrapText: true };
    });
    row.height = 24;
}

function applyBorders(row: ExcelJS.Row) {
    row.eachCell((cell) => {
        cell.border = THIN_BORDER;
        cell.font = { name: 'Calibri', size: 10 };
    });
}

function autofitColumns(ws: ExcelJS.Worksheet, min = 12, max = 40) {
    ws.columns.forEach((col) => {
        let longest = min;
        col.eachCell?.({ includeEmpty: true }, (cell) => {
            const raw =
                cell.value == null
                    ? ''
                    : typeof cell.value === 'object' && 'text' in (cell.value as object)
                      ? String((cell.value as { text?: string }).text || '')
                      : String(cell.value);
            longest = Math.min(max, Math.max(longest, raw.length + 2));
        });
        col.width = longest;
    });
}

function periodLabel(period: CommercialistaPeriod): string {
    if (period.kind === 'year') return `Anno ${period.year}`;
    return `T${period.quarter} ${period.year}`;
}

export function commercialistaCorrispettiviFilename(period: CommercialistaPeriod): string {
    const p = period.kind === 'year' ? 'ANNO' : `T${period.quarter}`;
    return `FloreMoria_${period.year}_${p}_Corrispettivi.xlsx`;
}

function sumCorrispettiviFromReport(report: TaxQuarterlyReport): CommercialistaCorrispettiviTotals {
    const byRateMap = new Map<string, CommercialistaCorrispettiviTotals['byRate'][number]>();
    let imponibileCents = 0;
    let ivaDebitoCents = 0;
    let lordoCents = 0;

    for (const r of report.corrispettivi) {
        lordoCents += r.grossCents;
        const eligible = r.vatCertainty !== 'MANCANTE';
        if (eligible) {
            imponibileCents += r.imponibileCents;
            ivaDebitoCents += r.ivaDebitoCents;
        }
        const key = eligible ? String(r.vatRate) : 'MANCANTE';
        const rate = eligible ? r.vatRate : null;
        const cur = byRateMap.get(key) || {
            vatRate: rate,
            salesCount: 0,
            imponibileCents: 0,
            ivaDebitoCents: 0,
            lordoCents: 0,
        };
        cur.salesCount += 1;
        cur.lordoCents += r.grossCents;
        if (eligible) {
            cur.imponibileCents += r.imponibileCents;
            cur.ivaDebitoCents += r.ivaDebitoCents;
        }
        byRateMap.set(key, cur);
    }

    return {
        salesCount: report.corrispettivi.length,
        imponibileCents,
        ivaDebitoCents,
        lordoCents,
        byRate: [...byRateMap.values()].sort((a, b) => (a.vatRate ?? 999) - (b.vatRate ?? 999)),
    };
}

function assertConsistencyWithDossier(
    f2: CommercialistaCorrispettiviTotals,
    report: TaxQuarterlyReport
): void {
    const dossier = sumCorrispettiviFromReport(report);
    const diffs: CommercialistaConsistencyError['diffs'] = [];
    const checks: Array<{ voice: string; expected: number; actual: number }> = [
        { voice: 'numero vendite', expected: dossier.salesCount, actual: f2.salesCount },
        { voice: 'imponibile', expected: dossier.imponibileCents, actual: f2.imponibileCents },
        { voice: 'IVA a debito', expected: dossier.ivaDebitoCents, actual: f2.ivaDebitoCents },
        { voice: 'totale lordo', expected: dossier.lordoCents, actual: f2.lordoCents },
        {
            voice: 'summary.corrispettiviLordoCents',
            expected: report.summary.corrispettiviLordoCents,
            actual: f2.lordoCents,
        },
        {
            voice: 'summary.corrispettiviImponibileCents',
            expected: report.summary.corrispettiviImponibileCents,
            actual: f2.imponibileCents,
        },
        {
            voice: 'summary.ivaDebito10Cents',
            expected: report.summary.ivaDebito10Cents,
            actual: f2.ivaDebitoCents,
        },
    ];
    for (const c of checks) {
        if (c.expected !== c.actual) {
            diffs.push({
                voice: c.voice,
                expectedCents: c.expected,
                actualCents: c.actual,
                deltaCents: c.actual - c.expected,
            });
        }
    }
    if (diffs.length) throw new CommercialistaConsistencyError(diffs);
}

/**
 * Consegne fiorista nel periodo senza fattura né scontrino.
 * Perché: spiega al commercialista il gap costi deducibili vs movimentato.
 */
export async function loadCostiSenzaDocumento(
    start: Date,
    end: Date
): Promise<CommercialistaCostiSenzaDocRow[]> {
    const missing = await listFloristMissingInvoices();
    const rows: CommercialistaCostiSenzaDocRow[] = [];

    for (const r of missing) {
        // Ha già scontrino/ricevuta o expense collegata → escluso
        if (r.receiptUrl || r.receiptPath || r.linkedExpenseId) continue;

        const deliveryIso = r.orderDeliveryDate || r.paymentDate;
        const d = parseYmd(deliveryIso);
        if (!d || d < start || d > end) continue;

        rows.push({
            orderNumber: r.orderNumber || (r.orderId ? r.orderId.slice(0, 10) : '—'),
            floristName: r.partnerName,
            amountCents: r.amountCents,
            deliveryDate: deliveryIso,
        });
    }

    rows.sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));
    return rows;
}

async function loadReport(period: CommercialistaPeriod): Promise<TaxQuarterlyReport> {
    if (period.kind === 'year') {
        return buildTaxQuarterlyReport(period.year, 1, { fullYear: true });
    }
    return buildTaxQuarterlyReport(period.year, period.quarter);
}

function buildF1(
    wb: ExcelJS.Workbook,
    period: CommercialistaPeriod,
    totals: CommercialistaCorrispettiviTotals,
    generatedAt: Date
) {
    const ws = wb.addWorksheet('F1 — Riepilogo');
    ws.addRow(['Ragione sociale', FLOREMORIA_LEGAL_ENTITY.legalName]);
    ws.addRow(['P.IVA', FLOREMORIA_LEGAL_ENTITY.vatNumber]);
    ws.addRow(['Periodo di riferimento', periodLabel(period)]);
    ws.addRow([
        'Data e ora generazione',
        generatedAt.toLocaleString('it-IT', { timeZone: 'Europe/Rome' }),
    ]);
    ws.addRow([]);

    const header = ws.addRow([
        'Voce',
        'N. vendite',
        'Imponibile EUR',
        'Aliquota %',
        'IVA a debito EUR',
        'Totale lordo EUR',
    ]);
    styleHeaderRow(header);

    for (const b of totals.byRate) {
        const row = ws.addRow([
            b.vatRate == null ? 'Aliquota mancante' : `Vendite IVA ${b.vatRate}%`,
            b.salesCount,
            euroNum(b.imponibileCents),
            b.vatRate == null ? '' : b.vatRate,
            euroNum(b.ivaDebitoCents),
            euroNum(b.lordoCents),
        ]);
        applyBorders(row);
        row.getCell(3).numFmt = EUR_FORMAT;
        row.getCell(5).numFmt = EUR_FORMAT;
        row.getCell(6).numFmt = EUR_FORMAT;
    }

    const tot = ws.addRow([
        'TOTALE',
        totals.salesCount,
        euroNum(totals.imponibileCents),
        '',
        euroNum(totals.ivaDebitoCents),
        euroNum(totals.lordoCents),
    ]);
    applyBorders(tot);
    tot.font = { bold: true, name: 'Calibri', size: 10 };
    tot.getCell(3).numFmt = EUR_FORMAT;
    tot.getCell(5).numFmt = EUR_FORMAT;
    tot.getCell(6).numFmt = EUR_FORMAT;

    ws.addRow([]);
    ws.addRow([
        'Nota 1',
        'Il corrispettivo registrato è il lordo della vendita (importo pagato in checkout), non il netto accreditato dal gateway (Stripe/PayPal).',
    ]);
    ws.addRow([
        'Nota 2',
        'Per i costi fiorista senza fattura/scontrino nel periodo vedere il foglio «F3 — Costi senza documento».',
    ]);

    autofitColumns(ws, 14, 72);
    ws.views = [{ state: 'frozen', ySplit: 6 }];
}

function buildF2(wb: ExcelJS.Workbook, report: TaxQuarterlyReport): CommercialistaCorrispettiviTotals {
    const ws = wb.addWorksheet('F2 — Registro corrispettivi');
    const headers = [
        'Data ordine',
        'Riferimento ordine',
        'Canale di incasso',
        'Imponibile EUR',
        'Aliquota %',
        'IVA EUR',
        'Totale lordo EUR',
    ];
    styleHeaderRow(ws.addRow(headers));

    const sorted = [...report.corrispettivi].sort((a, b) =>
        (a.paymentDate || a.date).localeCompare(b.paymentDate || b.date)
    );

    if (!sorted.length) {
        const empty = ws.addRow(['nessun movimento nel periodo', '', '', '', '', '', '']);
        applyBorders(empty);
        autofitColumns(ws);
        ws.views = [{ state: 'frozen', ySplit: 1 }];
        return {
            salesCount: 0,
            imponibileCents: 0,
            ivaDebitoCents: 0,
            lordoCents: 0,
            byRate: [],
        };
    }

    let imponibileCents = 0;
    let ivaDebitoCents = 0;
    let lordoCents = 0;
    const byRateMap = new Map<string, CommercialistaCorrispettiviTotals['byRate'][number]>();

    for (const r of sorted) {
        const eligible = r.vatCertainty !== 'MANCANTE';
        const dateVal = parseYmd(r.paymentDate || r.date);
        const row = ws.addRow([
            dateVal || r.paymentDate || r.date,
            r.orderNumber || '',
            r.gateway || '',
            eligible ? euroNum(r.imponibileCents) : '',
            eligible ? r.vatRate || '' : '',
            eligible ? euroNum(r.ivaDebitoCents) : '',
            euroNum(r.grossCents),
        ]);
        applyBorders(row);
        if (dateVal) row.getCell(1).numFmt = DATE_FORMAT;
        for (const col of [4, 6, 7]) {
            if (row.getCell(col).value !== '') row.getCell(col).numFmt = EUR_FORMAT;
        }

        lordoCents += r.grossCents;
        if (eligible) {
            imponibileCents += r.imponibileCents;
            ivaDebitoCents += r.ivaDebitoCents;
        }
        const key = eligible ? String(r.vatRate) : 'MANCANTE';
        const cur = byRateMap.get(key) || {
            vatRate: eligible ? r.vatRate : null,
            salesCount: 0,
            imponibileCents: 0,
            ivaDebitoCents: 0,
            lordoCents: 0,
        };
        cur.salesCount += 1;
        cur.lordoCents += r.grossCents;
        if (eligible) {
            cur.imponibileCents += r.imponibileCents;
            cur.ivaDebitoCents += r.ivaDebitoCents;
        }
        byRateMap.set(key, cur);
    }

    const tot = ws.addRow([
        'TOTALE',
        '',
        '',
        euroNum(imponibileCents),
        '',
        euroNum(ivaDebitoCents),
        euroNum(lordoCents),
    ]);
    applyBorders(tot);
    tot.font = { bold: true, name: 'Calibri', size: 10 };
    tot.getCell(4).numFmt = EUR_FORMAT;
    tot.getCell(6).numFmt = EUR_FORMAT;
    tot.getCell(7).numFmt = EUR_FORMAT;

    autofitColumns(ws);
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    return {
        salesCount: sorted.length,
        imponibileCents,
        ivaDebitoCents,
        lordoCents,
        byRate: [...byRateMap.values()].sort((a, b) => (a.vatRate ?? 999) - (b.vatRate ?? 999)),
    };
}

function buildF3(wb: ExcelJS.Workbook, rows: CommercialistaCostiSenzaDocRow[]): number {
    const ws = wb.addWorksheet('F3 — Costi senza documento');
    styleHeaderRow(
        ws.addRow(['Riferimento ordine', 'Fiorista', 'Importo EUR', 'Data consegna'])
    );

    if (!rows.length) {
        const empty = ws.addRow(['nessun movimento nel periodo', '', '', '']);
        applyBorders(empty);
        autofitColumns(ws);
        ws.views = [{ state: 'frozen', ySplit: 1 }];
        return 0;
    }

    let total = 0;
    for (const r of rows) {
        const d = parseYmd(r.deliveryDate);
        const row = ws.addRow([
            r.orderNumber,
            r.floristName,
            euroNum(r.amountCents),
            d || r.deliveryDate,
        ]);
        applyBorders(row);
        row.getCell(3).numFmt = EUR_FORMAT;
        if (d) row.getCell(4).numFmt = DATE_FORMAT;
        total += r.amountCents;
    }

    const tot = ws.addRow(['TOTALE', '', euroNum(total), '']);
    applyBorders(tot);
    tot.font = { bold: true, name: 'Calibri', size: 10 };
    tot.getCell(3).numFmt = EUR_FORMAT;

    autofitColumns(ws);
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    return total;
}

/**
 * Genera il workbook commercialista (3 fogli F1→F2→F3).
 * Lancia CommercialistaConsistencyError se F1/F2 ≠ dossier fiscale stesso periodo.
 */
export async function buildCommercialistaCorrispettiviXlsxOrdered(
    period: CommercialistaPeriod
): Promise<{ buffer: Buffer; preview: CommercialistaCorrispettiviPreview }> {
    const report = await loadReport(period);
    const bounds =
        period.kind === 'year'
            ? resolveYearBounds(period.year)
            : resolveQuarterBounds(period.year, period.quarter);
    const costi = await loadCostiSenzaDocumento(bounds.start, bounds.end);
    const dossierTotals = sumCorrispettiviFromReport(report);

    // Pre-check: F2 totals must match dossier before writing bytes
    const f2Probe = sumCorrispettiviFromReport(report);
    assertConsistencyWithDossier(f2Probe, report);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'FloreMoria';
    wb.created = new Date();
    wb.modified = new Date();

    const generatedAt = new Date();
    buildF1(wb, period, dossierTotals, generatedAt);
    const f2Totals = buildF2(wb, report);
    assertConsistencyWithDossier(f2Totals, report);
    const f3Total = buildF3(wb, costi);

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return {
        buffer,
        preview: {
            filename: commercialistaCorrispettiviFilename(period),
            periodLabel: periodLabel(period),
            generatedAtIso: generatedAt.toISOString(),
            f1: dossierTotals,
            f2RowCount: f2Totals.salesCount,
            f2: f2Totals,
            f3RowCount: costi.length,
            f3TotalCents: f3Total,
            consistencyOk: true,
        },
    };
}

export async function assertCommercialistaCorrispettiviPrivacy(buffer: Buffer): Promise<void> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);

    const forbidden = COMMERCIALISTA_CORRISPETTIVI_FORBIDDEN_HEADERS;
    const hits: string[] = [];

    const normalize = (v: unknown) =>
        String(
            v == null
                ? ''
                : typeof v === 'object' && 'text' in (v as object)
                  ? (v as { text?: string }).text || ''
                  : v
        )
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, '');

    // Solo riga intestazione di ogni foglio + nomi fogli (non le note libere)
    wb.eachSheet((ws) => {
        const sheetNorm = normalize(ws.name);
        for (const f of forbidden) {
            if (sheetNorm.includes(f)) hits.push(`Sheet name: ${ws.name}`);
        }
        const headerRow = ws.getRow(1);
        headerRow.eachCell((cell) => {
            const h = normalize(cell.value);
            for (const f of forbidden) {
                if (h === f || h.includes(f)) {
                    hits.push(`${ws.name} header: "${String(cell.value)}" → [${f}]`);
                }
            }
        });
    });

    const f2 = wb.getWorksheet('F2 — Registro corrispettivi');
    if (f2) {
        const allowed = new Set([
            'dataordine',
            'riferimentoordine',
            'canalediincasso',
            'imponibileeur',
            'aliquota%',
            'ivaeur',
            'totalelordoeur',
            'nessunmovimentonelperiodo',
            'totale',
        ]);
        const headerRow = f2.getRow(1);
        headerRow.eachCell((cell) => {
            const h = normalize(cell.value);
            if (h && !allowed.has(h) && ![...forbidden].some((f) => h.includes(f))) {
                // header extra non in whitelist: segnala solo se sospetto PII
            }
            for (const f of forbidden) {
                if (h.includes(f)) hits.push(`F2 header vietato: ${String(cell.value)}`);
            }
        });
    }

    if (hits.length) {
        throw new Error(
            `[commercialista-corrispettivi-privacy] FAIL:\n${[...new Set(hits)].join('\n')}`
        );
    }
}
