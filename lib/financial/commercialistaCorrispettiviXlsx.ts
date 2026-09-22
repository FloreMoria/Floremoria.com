/**
 * Export commercialista — F1 Riepilogo + F2 Registro Corrispettivi (F3 sospeso).
 * Fonte corrispettivi = stesso motore del dossier fiscale (buildTaxQuarterlyReport).
 * Zero PII cliente/defunto/destinatario.
 */
import ExcelJS from 'exceljs';
import prisma from '@/lib/prisma';
import { FLOREMORIA_LEGAL_ENTITY } from '@/lib/financial/companyBankDetails';
import {
    buildTaxQuarterlyReport,
    type TaxQuarter,
    type TaxQuarterlyReport,
} from '@/lib/financial/taxQuarterly';
import { listFloristMissingInvoices } from '@/lib/financial/floristMissingInvoices';
import {
    extractPrepaidParentOrderRef,
    isPrepaidSubscriptionPoseOrder,
} from '@/lib/financial/prepaidSubscriptionOrders';
import { VAT_PCT_FLORAL } from '@/lib/financial/vat';

const EUR_FORMAT = '€ #,##0.00';
const LORDO_TOLERANCE_CENTS = 1;

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
    /** S = posa di ordine prepagato; N = vendita ordinaria. */
    prepaidFlag: 'S' | 'N';
    /** Riferimento ordine padre (carnet / abbonamento), se prepagato. */
    prepaidParentOrderRef: string;
};

export type CommercialistaCorrispettiviPreview = {
    filename: string;
    periodLabel: string;
    generatedAtIso: string;
    f1: CommercialistaCorrispettiviTotals;
    f2RowCount: number;
    f2: CommercialistaCorrispettiviTotals;
    /** F3 sospeso finché l'attribuzione bonifici→fiorista non è corretta. */
    f3RowCount: number;
    f3TotalCents: number;
    f3Included: false;
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

/** Controlli indipendenti sul file (non solo confronto dossier↔file). */
export class CommercialistaSelfCheckError extends Error {
    readonly check: string;
    readonly failingRows: number;
    readonly amountCents: number;

    constructor(check: string, failingRows: number, amountCents: number, detail: string) {
        super(
            `Controllo file fallito: ${check}. Righe: ${failingRows}. Importo: €${(amountCents / 100).toFixed(2)}. ${detail}`
        );
        this.name = 'CommercialistaSelfCheckError';
        this.check = check;
        this.failingRows = failingRows;
        this.amountCents = amountCents;
    }
}

function euroNum(cents: number): number {
    return Number((Number(cents) / 100).toFixed(2));
}

function parseYmd(ymd: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
    if (!m) return null;
    // Mezzogiorno locale: evita shift giorno in Excel; l'orario non viene esportato (solo stringa data).
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
}

/** Data solo calendario DD/MM/YYYY — niente componente orario in cella. */
function formatDateOnlyIt(ymd: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    const d = parseYmd(ymd);
    if (!d) return ymd.trim();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()}`;
}

/**
 * Riferimento ordine verificabile: codice FM/FT se collegato, altrimenti id transazione gateway.
 * Non usare etichette interne tipo DA_COLLEGARE nel foglio commercialista.
 */
export function orderRefForExport(
    orderNumber: string | null | undefined,
    transactionId?: string | null
): string {
    const n = (orderNumber || '').trim();
    if (n) return n;
    const tx = (transactionId || '').trim();
    return tx || '—';
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
        imponibileCents += r.imponibileCents;
        ivaDebitoCents += r.ivaDebitoCents;
        const rate = r.vatRate || VAT_PCT_FLORAL;
        const key = String(rate);
        const cur = byRateMap.get(key) || {
            vatRate: rate,
            salesCount: 0,
            imponibileCents: 0,
            ivaDebitoCents: 0,
            lordoCents: 0,
        };
        cur.salesCount += 1;
        cur.lordoCents += r.grossCents;
        cur.imponibileCents += r.imponibileCents;
        cur.ivaDebitoCents += r.ivaDebitoCents;
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
 * Tre verifiche indipendenti sul contenuto F2/F1 (non sul dossier).
 * Se una fallisce, il file non si genera.
 */
function assertIndependentFileChecks(
    f2Rows: Array<{
        imponibileCents: number;
        ivaCents: number;
        lordoCents: number;
        vatRate: number | null;
    }>,
    f1: CommercialistaCorrispettiviTotals,
    f2: CommercialistaCorrispettiviTotals
): void {
    // 1) ogni riga ha aliquota e IVA valorizzate
    const missingVat = f2Rows.filter(
        (r) =>
            r.vatRate == null ||
            !Number.isFinite(r.vatRate) ||
            r.vatRate <= 0 ||
            r.ivaCents == null ||
            !Number.isFinite(r.ivaCents)
    );
    if (missingVat.length) {
        const amount = missingVat.reduce((s, r) => s + Math.abs(r.lordoCents), 0);
        throw new CommercialistaSelfCheckError(
            'F2: aliquota e IVA valorizzate su ogni riga',
            missingVat.length,
            amount,
            'Una o più righe senza aliquota o senza IVA.'
        );
    }

    // 2) imponibile + IVA = lordo (± €0,01)
    const unbalanced = f2Rows.filter(
        (r) => Math.abs(r.imponibileCents + r.ivaCents - r.lordoCents) > LORDO_TOLERANCE_CENTS
    );
    if (unbalanced.length) {
        const amount = unbalanced.reduce(
            (s, r) => s + Math.abs(r.imponibileCents + r.ivaCents - r.lordoCents),
            0
        );
        throw new CommercialistaSelfCheckError(
            'F2: imponibile + IVA = lordo (tolleranza €0,01)',
            unbalanced.length,
            amount,
            'Scorporo incoerente su una o più righe.'
        );
    }

    // 3) somma F2 = totale F1
    const sumDiffs: Array<{ voice: string; delta: number }> = [];
    if (f2.salesCount !== f1.salesCount) {
        sumDiffs.push({ voice: 'n. vendite', delta: f2.salesCount - f1.salesCount });
    }
    if (f2.imponibileCents !== f1.imponibileCents) {
        sumDiffs.push({ voice: 'imponibile', delta: f2.imponibileCents - f1.imponibileCents });
    }
    if (f2.ivaDebitoCents !== f1.ivaDebitoCents) {
        sumDiffs.push({ voice: 'IVA', delta: f2.ivaDebitoCents - f1.ivaDebitoCents });
    }
    if (f2.lordoCents !== f1.lordoCents) {
        sumDiffs.push({ voice: 'lordo', delta: f2.lordoCents - f1.lordoCents });
    }
    if (sumDiffs.length) {
        const amount = Math.max(...sumDiffs.map((d) => Math.abs(d.delta)));
        throw new CommercialistaSelfCheckError(
            'Somma righe F2 = totale F1',
            sumDiffs.length,
            amount,
            sumDiffs.map((d) => `${d.voice} Δ €${(d.delta / 100).toFixed(2)}`).join('; ')
        );
    }
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
    const candidateOrderIds = [
        ...new Set(missing.map((r) => r.orderId).filter(Boolean) as string[]),
    ];
    const orders =
        candidateOrderIds.length > 0
            ? await prisma.order.findMany({
                  where: { id: { in: candidateOrderIds }, deletedAt: null },
                  select: {
                      id: true,
                      orderNumber: true,
                      isRecurring: true,
                      stripeTransactionId: true,
                      grossAmount: true,
                      netAmount: true,
                      stripeFee: true,
                      paymentMethodLabel: true,
                      additionalInstructions: true,
                      financeNotes: true,
                      totalPriceCents: true,
                      deliveryDate: true,
                      status: true,
                  },
              })
            : [];
    const orderById = new Map(orders.map((o) => [o.id, o]));

    const rows: CommercialistaCostiSenzaDocRow[] = [];

    for (const r of missing) {
        // Ha già scontrino/ricevuta o expense collegata → escluso
        if (r.receiptUrl || r.receiptPath || r.linkedExpenseId) continue;

        const deliveryIso = r.orderDeliveryDate || r.paymentDate;
        const d = parseYmd(deliveryIso);
        if (!d || d < start || d > end) continue;

        const order = r.orderId ? orderById.get(r.orderId) : undefined;
        const prepaid = order ? isPrepaidSubscriptionPoseOrder(order) : false;
        const parentRef = order ? extractPrepaidParentOrderRef(order) : null;

        rows.push({
            orderNumber: r.orderNumber || (r.orderId ? r.orderId.slice(0, 10) : '—'),
            floristName: r.partnerName,
            amountCents: r.amountCents,
            deliveryDate: deliveryIso,
            prepaidFlag: prepaid ? 'S' : 'N',
            prepaidParentOrderRef: prepaid ? parentRef || '—' : '',
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
            `Vendite IVA ${b.vatRate ?? VAT_PCT_FLORAL}%`,
            b.salesCount,
            euroNum(b.imponibileCents),
            b.vatRate ?? VAT_PCT_FLORAL,
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
        'Aliquota unica 10% su tutto il corrispettivo (accessorietà — METODO §8.3).',
    ]);
    ws.addRow([
        'Nota 3',
        'I costi verso i fioristi sono comunicati separatamente.',
    ]);

    autofitColumns(ws, 14, 72);
    ws.views = [{ state: 'frozen', ySplit: 6 }];
}

function buildF2(
    wb: ExcelJS.Workbook,
    report: TaxQuarterlyReport
): {
    totals: CommercialistaCorrispettiviTotals;
    probeRows: Array<{
        imponibileCents: number;
        ivaCents: number;
        lordoCents: number;
        vatRate: number | null;
    }>;
} {
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
            totals: {
                salesCount: 0,
                imponibileCents: 0,
                ivaDebitoCents: 0,
                lordoCents: 0,
                byRate: [],
            },
            probeRows: [],
        };
    }

    let imponibileCents = 0;
    let ivaDebitoCents = 0;
    let lordoCents = 0;
    const byRateMap = new Map<string, CommercialistaCorrispettiviTotals['byRate'][number]>();
    const probeRows: Array<{
        imponibileCents: number;
        ivaCents: number;
        lordoCents: number;
        vatRate: number | null;
    }> = [];

    for (const r of sorted) {
        const rate = r.vatRate || VAT_PCT_FLORAL;
        const dateStr = formatDateOnlyIt(r.paymentDate || r.date);
        const row = ws.addRow([
            dateStr,
            orderRefForExport(r.orderNumber, r.transactionId),
            r.gateway || '',
            euroNum(r.imponibileCents),
            rate,
            euroNum(r.ivaDebitoCents),
            euroNum(r.grossCents),
        ]);
        applyBorders(row);
        for (const col of [4, 6, 7]) {
            row.getCell(col).numFmt = EUR_FORMAT;
        }

        lordoCents += r.grossCents;
        imponibileCents += r.imponibileCents;
        ivaDebitoCents += r.ivaDebitoCents;
        probeRows.push({
            imponibileCents: r.imponibileCents,
            ivaCents: r.ivaDebitoCents,
            lordoCents: r.grossCents,
            vatRate: rate,
        });

        const key = String(rate);
        const cur = byRateMap.get(key) || {
            vatRate: rate,
            salesCount: 0,
            imponibileCents: 0,
            ivaDebitoCents: 0,
            lordoCents: 0,
        };
        cur.salesCount += 1;
        cur.lordoCents += r.grossCents;
        cur.imponibileCents += r.imponibileCents;
        cur.ivaDebitoCents += r.ivaDebitoCents;
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
        totals: {
            salesCount: sorted.length,
            imponibileCents,
            ivaDebitoCents,
            lordoCents,
            byRate: [...byRateMap.values()].sort((a, b) => (a.vatRate ?? 999) - (b.vatRate ?? 999)),
        },
        probeRows,
    };
}

function buildF3(wb: ExcelJS.Workbook, rows: CommercialistaCostiSenzaDocRow[]): number {
    const ws = wb.addWorksheet('F3 — Costi senza documento');
    styleHeaderRow(
        ws.addRow([
            'Riferimento ordine',
            'Fiorista',
            'Importo EUR',
            'Data consegna',
            'Ordine prepagato (S/N)',
            'Riferimento ordine originale',
        ])
    );

    if (!rows.length) {
        const empty = ws.addRow(['nessun movimento nel periodo', '', '', '', '', '']);
        applyBorders(empty);
        autofitColumns(ws);
        ws.views = [{ state: 'frozen', ySplit: 1 }];
        return 0;
    }

    let total = 0;
    for (const r of rows) {
        const row = ws.addRow([
            r.orderNumber,
            r.floristName,
            euroNum(r.amountCents),
            formatDateOnlyIt(r.deliveryDate),
            r.prepaidFlag,
            r.prepaidParentOrderRef,
        ]);
        applyBorders(row);
        row.getCell(3).numFmt = EUR_FORMAT;
        total += r.amountCents;
    }

    const tot = ws.addRow(['TOTALE', '', euroNum(total), '', '', '']);
    applyBorders(tot);
    tot.font = { bold: true, name: 'Calibri', size: 10 };
    tot.getCell(3).numFmt = EUR_FORMAT;

    autofitColumns(ws);
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    return total;
}

/**
 * Genera il workbook commercialista (F1 Riepilogo + F2 Registro).
 * F3 sospeso: rientrerà quando l'attribuzione bonifici→consegne sarà corretta.
 * Lancia CommercialistaConsistencyError / CommercialistaSelfCheckError se i controlli falliscono.
 */
export async function buildCommercialistaCorrispettiviXlsxOrdered(
    period: CommercialistaPeriod
): Promise<{ buffer: Buffer; preview: CommercialistaCorrispettiviPreview }> {
    const report = await loadReport(period);
    const dossierTotals = sumCorrispettiviFromReport(report);

    // Pre-check dossier ↔ totali attesi
    const f2Probe = sumCorrispettiviFromReport(report);
    assertConsistencyWithDossier(f2Probe, report);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'FloreMoria';
    wb.created = new Date();
    wb.modified = new Date();

    const generatedAt = new Date();
    buildF1(wb, period, dossierTotals, generatedAt);
    const { totals: f2Totals, probeRows } = buildF2(wb, report);
    assertConsistencyWithDossier(f2Totals, report);
    assertIndependentFileChecks(probeRows, dossierTotals, f2Totals);
    // F3 non generato (sospeso) — vedi METODO / handoff commercialista

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
            f3RowCount: 0,
            f3TotalCents: 0,
            f3Included: false,
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
        const headerRow = f2.getRow(1);
        headerRow.eachCell((cell) => {
            const h = normalize(cell.value);
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
