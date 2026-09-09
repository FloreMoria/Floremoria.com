/**
 * Dossier Fiscale Completo — workbook Excel (METODO v1.7).
 *
 * Fogli:
 *  0. Quadratura (§4)
 *  1. Registro Corrispettivi (§8 / §8.3)
 *  2. Prima Nota (Master)
 *  3. Estratto Conto Fineco
 *  4. Acquisti — SDI + autofatture (§6.5)
 *  5. Dettaglio Gateway Stripe
 *  6. Dettaglio Gateway PayPal
 *  7. Eccezioni (§9) — sempre presente
 */

import ExcelJS from 'exceljs';
import prisma from '@/lib/prisma';
import type { TaxQuarter, TaxQuarterlyReport } from '@/lib/financial/taxQuarterly';
import {
    listHistoricalLedgerEntries,
    type HistoricalLedgerFilters,
} from '@/lib/financial/historicalLedgerQuery';
import {
    CATEGORY_LABELS,
    type LedgerCategory,
} from '@/lib/financial/historicalLedgerTypes';
import { extractBareFinecoTrn } from '@/lib/financial/bankStatements/parseFinecoPaste';
import { recomputeSequentialRunningBalance } from '@/lib/accounting/paypalStateMachine';
import { parsePaypalSourceKey } from '@/lib/financial/paypalSourceKeys';
import {
    resolveAcquistiSheetRows,
    sumAcquistiImponibileCents,
    type DossierExceptionRow,
} from '@/lib/financial/dossierAcquistiBuild';
import {
    runAllDossierControls,
    type DossierControlResult,
} from '@/lib/financial/dossierFiscalControls';
import {
    summarizeCorrispettiviVatCertainty,
} from '@/lib/financial/dossierCorrispettiviBuild';

const HEADER_FILL: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFDBEAFE' }, // soft blue
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

const EUR_FORMAT = '€ #,##0.00';
/** Versione del metodo applicata (METODO §12). */
export const DOSSIER_METHOD_VERSION = '1.7';
const DOSSIER_VERSION = `dossier-fiscale-metodo-v${DOSSIER_METHOD_VERSION}`;

function euroNum(cents: number): number {
    return Number((Number(cents) / 100).toFixed(2));
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

function autofitColumns(ws: ExcelJS.Worksheet, min = 10, max = 44) {
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

function applyBorders(row: ExcelJS.Row) {
    row.eachCell((cell) => {
        cell.border = THIN_BORDER;
        cell.font = { name: 'Calibri', size: 10 };
    });
}

/** Aggiunge riga SUM in fondo per colonne euro (1-based indexes). */
function appendSumRow(
    ws: ExcelJS.Worksheet,
    labelCol: number,
    sumCols: number[],
    label = 'TOTALE',
) {
    const lastData = ws.rowCount;
    if (lastData < 2) return;
    const sumRow = ws.addRow([]);
    sumRow.getCell(labelCol).value = label;
    sumRow.getCell(labelCol).font = { bold: true, name: 'Calibri', size: 10 };
    for (const col of sumCols) {
        const letter = ws.getColumn(col).letter;
        const cell = sumRow.getCell(col);
        cell.value = { formula: `SUM(${letter}2:${letter}${lastData})` };
        cell.numFmt = EUR_FORMAT;
        cell.font = { bold: true, name: 'Calibri', size: 10 };
    }
    applyBorders(sumRow);
    sumRow.eachCell((cell) => {
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF1F5F9' },
        };
    });
}

function channelLabel(sourceType: string, category: string): string {
    if (sourceType === 'BANK_LINE' || sourceType === 'BANK_LINE_MANUAL') return 'Fineco';
    if (sourceType === 'STRIPE_MOVEMENT' || category === 'TRASFERIMENTO_INTERNO') {
        if (/STRIPE/i.test(sourceType)) return 'Stripe → Fineco';
    }
    if (sourceType === 'PAYPAL_MOVEMENT' || category === 'PAYPAL_PAYOUT') return 'PayPal → Fineco';
    if (sourceType.startsWith('STRIPE')) return 'Stripe';
    if (sourceType.startsWith('PAYPAL')) return 'PayPal';
    return sourceType || '—';
}

function isFullYearLabel(label: string): boolean {
    return /^COMPLETO\b/i.test(label);
}

async function buildPrimaNotaMasterSheet(wb: ExcelJS.Workbook, report: TaxQuarterlyReport) {
    const filters: HistoricalLedgerFilters = {
        fiscalYear: report.bounds.year,
        fiscalQuarter: isFullYearLabel(report.bounds.label) ? null : report.bounds.quarter,
        month: /^\d{2}\/\d{4}$/.test(report.bounds.label)
            ? Number(report.bounds.label.slice(0, 2))
            : null,
        direction: 'ALL',
        take: 5000,
        skip: 0,
    };

    const { rows } = await listHistoricalLedgerEntries(filters);
    const withRunning = recomputeSequentialRunningBalance(rows, 0);

    const ws = wb.addWorksheet('Prima Nota (Master)');
    const headers = [
        'Data',
        'Descrizione / Causale Economica',
        'Controparte / Fornitore Reale',
        'Dare/Avere (Importo EUR)',
        'Canale / Conto',
        'Mastro Contabile',
        'Riferimento Fiscale',
        'Saldo Progressivo',
    ];
    styleHeaderRow(ws.addRow(headers));

    let entrataCents = 0;
    let uscitaCents = 0;

    for (const { row: r, runningCents } of withRunning) {
        const signed = r.totalCents;
        if (signed >= 0) entrataCents += Math.abs(signed);
        else uscitaCents += Math.abs(signed);

        const dateMs =
            r.accountingDate instanceof Date
                ? r.accountingDate
                : new Date(String(r.accountingDate || ''));
        const ref =
            r.documentRef ||
            r.orderId ||
            extractBareFinecoTrn(r.description || '') ||
            r.sourceId ||
            '';

        const row = ws.addRow([
            Number.isNaN(dateMs.getTime()) ? '' : dateMs.toISOString().slice(0, 10),
            r.description || '',
            r.counterpartyName || '',
            euroNum(signed),
            channelLabel(r.sourceType, r.category),
            CATEGORY_LABELS[r.category as LedgerCategory] || r.category || '',
            ref,
            euroNum(runningCents),
        ]);
        applyBorders(row);
        row.getCell(4).numFmt = EUR_FORMAT;
        row.getCell(8).numFmt = EUR_FORMAT;
        if (signed < 0) row.getCell(4).font = { name: 'Calibri', size: 10, color: { argb: 'FFB91C1C' } };
        else row.getCell(4).font = { name: 'Calibri', size: 10, color: { argb: 'FF047857' } };
    }

    appendSumRow(ws, 3, [4], 'TOTALE MOVIMENTI');
    // Nota totali entrata/uscita
    const note = ws.addRow([
        '',
        `Totale Entrate € ${euroNum(entrataCents).toFixed(2)} · Totale Uscite € ${euroNum(uscitaCents).toFixed(2)} · Periodo ${report.bounds.label}`,
    ]);
    note.getCell(2).font = { italic: true, name: 'Calibri', size: 9, color: { argb: 'FF64748B' } };

    autofitColumns(ws);
    ws.views = [{ state: 'frozen', ySplit: 1 }];
}

async function buildFinecoSheet(wb: ExcelJS.Workbook, report: TaxQuarterlyReport) {
    const lines = await prisma.bankStatementLine.findMany({
        where: {
            OR: [
                { accountingDate: { gte: report.bounds.start, lte: report.bounds.end } },
                {
                    AND: [
                        { accountingDate: null },
                        { valueDate: { gte: report.bounds.start, lte: report.bounds.end } },
                    ],
                },
            ],
        },
        orderBy: [{ accountingDate: 'asc' }, { valueDate: 'asc' }, { lineIndex: 'asc' }],
        take: 5000,
    });

    const ws = wb.addWorksheet('Estratto Conto Fineco');
    const headers = [
        'Data operazione',
        'Data valuta',
        'Descrizione bancaria ufficiale',
        'Entrate EUR',
        'Uscite EUR',
        'Saldo bancario EUR',
        'Match',
        'Tipo match',
    ];
    styleHeaderRow(ws.addRow(headers));

    for (const l of lines) {
        const op =
            l.accountingDate instanceof Date
                ? l.accountingDate.toISOString().slice(0, 10)
                : l.accountingDate
                  ? String(l.accountingDate).slice(0, 10)
                  : '';
        const val =
            l.valueDate instanceof Date
                ? l.valueDate.toISOString().slice(0, 10)
                : l.valueDate
                  ? String(l.valueDate).slice(0, 10)
                  : '';
        const entrata = l.amountCents > 0 ? euroNum(l.amountCents) : '';
        const uscita = l.amountCents < 0 ? euroNum(Math.abs(l.amountCents)) : '';
        const row = ws.addRow([
            op,
            val,
            l.description || '',
            entrata,
            uscita,
            l.balanceCents != null ? euroNum(l.balanceCents) : '',
            l.matchStatus || '',
            l.matchType || '',
        ]);
        applyBorders(row);
        row.getCell(4).numFmt = EUR_FORMAT;
        row.getCell(5).numFmt = EUR_FORMAT;
        row.getCell(6).numFmt = EUR_FORMAT;
    }

    appendSumRow(ws, 3, [4, 5], 'TOTALE');
    autofitColumns(ws);
    ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function euroLabel(cents: number): string {
    if (!Number.isFinite(cents)) return 'n/d';
    return euroNum(cents).toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

async function loadBankRaccordo(report: TaxQuarterlyReport): Promise<{
    fileName: string;
    openingCents: number | null;
    closingCents: number | null;
    entrataCents: number;
    uscitaCents: number;
    diffCents: number | null;
}> {
    const docs = await prisma.bankStatementDocument.findMany({
        where: {
            OR: [
                {
                    periodStart: { lte: report.bounds.end },
                    periodEnd: { gte: report.bounds.start },
                },
                {
                    periodStart: null,
                    uploadedAt: { gte: report.bounds.start, lte: report.bounds.end },
                },
            ],
        },
        select: {
            id: true,
            fileName: true,
            openingBalanceCents: true,
            closingBalanceCents: true,
            periodStart: true,
            periodEnd: true,
        },
    });
    const withBoth = docs.filter(
        (d) => d.openingBalanceCents != null && d.closingBalanceCents != null
    );
    if (withBoth.length === 0) {
        const lines = await prisma.bankStatementLine.findMany({
            where: {
                OR: [
                    { accountingDate: { gte: report.bounds.start, lte: report.bounds.end } },
                    {
                        AND: [
                            { accountingDate: null },
                            { valueDate: { gte: report.bounds.start, lte: report.bounds.end } },
                        ],
                    },
                ],
            },
            select: { amountCents: true },
        });
        const entrata = lines.filter((l) => l.amountCents > 0).reduce((s, l) => s + l.amountCents, 0);
        const uscita = lines
            .filter((l) => l.amountCents < 0)
            .reduce((s, l) => s + Math.abs(l.amountCents), 0);
        return {
            fileName: '(nessun estratto con saldi dichiarati)',
            openingCents: null,
            closingCents: null,
            entrataCents: entrata,
            uscitaCents: uscita,
            diffCents: null,
        };
    }
    const pick = withBoth.sort((a, b) => {
        const aSpan = (a.periodEnd?.getTime() || 0) - (a.periodStart?.getTime() || 0);
        const bSpan = (b.periodEnd?.getTime() || 0) - (b.periodStart?.getTime() || 0);
        return bSpan - aSpan;
    })[0];
    const lines = await prisma.bankStatementLine.findMany({
        where: { documentId: pick.id },
        select: { amountCents: true },
    });
    const entrata = lines.filter((l) => l.amountCents > 0).reduce((s, l) => s + l.amountCents, 0);
    const uscita = lines
        .filter((l) => l.amountCents < 0)
        .reduce((s, l) => s + Math.abs(l.amountCents), 0);
    const opening = pick.openingBalanceCents!;
    const closing = pick.closingBalanceCents!;
    const sumMov = lines.reduce((s, l) => s + l.amountCents, 0);
    return {
        fileName: pick.fileName || pick.id,
        openingCents: opening,
        closingCents: closing,
        entrataCents: entrata,
        uscitaCents: uscita,
        diffCents: opening + sumMov - closing,
    };
}

async function buildQuadraturaSheet(
    wb: ExcelJS.Workbook,
    report: TaxQuarterlyReport,
    controls: DossierControlResult[],
    acquistiImponibileCents: number,
    italianAcquistiIvaCents: number,
    ivaRcFromAcquistiCents: number
) {
    const ws = wb.addWorksheet('Quadratura');

    const failed = controls.filter((c) => !c.passed);

    const title = ws.addRow([
        failed.length > 0 ? 'DOSSIER NON QUADRATO' : 'DOSSIER QUADRATO',
    ]);
    title.getCell(1).font = {
        bold: true,
        size: 14,
        name: 'Calibri',
        color: { argb: failed.length > 0 ? 'FFB91C1C' : 'FF047857' },
    };

    if (failed.length > 0) {
        ws.addRow([
            `Controlli falliti: ${failed.map((c) => c.id).join(', ')} — dettaglio nel foglio Eccezioni.`,
        ]);
    }
    ws.addRow([]);

    // --- 4.1 Esito controlli ---
    ws.addRow(['4.1 Esito dei controlli (METODO §5)']).getCell(1).font = {
        bold: true,
        size: 12,
        name: 'Calibri',
    };
    styleHeaderRow(ws.addRow(['ID', 'Controllo', 'Misurato', 'Atteso', 'Scostamento', 'Esito']));
    for (const c of controls) {
        const measured =
            c.unit === 'cents'
                ? Number.isFinite(c.measured)
                    ? euroNum(c.measured)
                    : 'n/d'
                : c.measured;
        const delta =
            c.unit === 'cents'
                ? Number.isFinite(c.delta)
                    ? euroNum(c.delta)
                    : 'n/d'
                : c.delta;
        const r = ws.addRow([
            c.id,
            c.name,
            measured,
            c.unit === 'cents' ? euroNum(0) : 0,
            delta,
            c.passed ? 'OK' : 'FAIL',
        ]);
        applyBorders(r);
        if (c.unit === 'cents') {
            r.getCell(3).numFmt = EUR_FORMAT;
            r.getCell(4).numFmt = EUR_FORMAT;
            r.getCell(5).numFmt = EUR_FORMAT;
        }
        if (!c.passed) {
            r.getCell(6).font = {
                bold: true,
                color: { argb: 'FFB91C1C' },
                name: 'Calibri',
                size: 10,
            };
        }
    }
    ws.addRow([]);

    // --- §8.3 Certezza aliquote ---
    const vatCert = summarizeCorrispettiviVatCertainty(
        report.corrispettivi.map((r) => ({
            date: r.date,
            paymentDate: r.paymentDate,
            canaleIncasso: r.gateway,
            orderNumber: r.orderNumber,
            orderId: r.orderId,
            transactionId: r.transactionId,
            listinoCents: r.listinoCents ?? r.grossCents,
            scontoCents: r.scontoCents ?? 0,
            grossCents: r.grossCents,
            vatRate: r.vatRate,
            imponibileCents: r.imponibileCents,
            ivaCents: r.ivaDebitoCents,
            vatCertainty: r.vatCertainty || 'MANCANTE',
            vatRuleNote: r.vatRuleNote || '',
        }))
    );
    ws.addRow(['§8.3 Certezza aliquota IVA (lordo per stato)']).getCell(1).font = {
        bold: true,
        size: 12,
        name: 'Calibri',
    };
    styleHeaderRow(ws.addRow(['Stato', 'Importo lordo EUR', 'Nota']));
    for (const [stato, cents, nota] of [
        ['Determinata', vatCert.determinataGrossCents, 'da Product.vatRatePercent'],
        ['Mista (ordine composito)', vatCert.mistaGrossCents, 'scomposta per aliquota'],
        ['Presunta', vatCert.presuntaGrossCents, 'unica regola METODO §8.3 (.eu ≤ 01/07/2026)'],
        ['Mancante (esclusa da IVA)', vatCert.mancanteGrossCents, 'vedi foglio Eccezioni'],
    ] as Array<[string, number, string]>) {
        const r = ws.addRow([stato, euroNum(cents), nota]);
        applyBorders(r);
        r.getCell(2).numFmt = EUR_FORMAT;
    }
    ws.addRow([]);

    // --- 4.2 Liquidazione IVA ---
    // Reverse charge: stesso importo a debito e a credito (§4.2). Preferiamo la somma IVA
    // dalle autofatture del foglio Acquisti; se zero, fallback al report.
    const ivaDebitoVendite = report.ivaSummary.ivaDebitoVendite10Cents;
    const imponibileVendite = report.ivaSummary.imponibileVendite10Cents;
    const ivaRc =
        ivaRcFromAcquistiCents > 0
            ? ivaRcFromAcquistiCents
            : report.ivaSummary.reverseChargeIvaCents;
    const ivaCreditoAcquisti = italianAcquistiIvaCents;
    const ivaDebitoTot = ivaDebitoVendite + ivaRc;
    const ivaCreditoTot = ivaCreditoAcquisti + ivaRc;
    const saldoIva = ivaDebitoTot - ivaCreditoTot;

    ws.addRow(['4.2 Liquidazione IVA del periodo']).getCell(1).font = {
        bold: true,
        size: 12,
        name: 'Calibri',
    };
    styleHeaderRow(ws.addRow(['Voce', 'Importo EUR', 'Fonte']));
    const ivaRows: Array<[string, number, string]> = [
        ['Imponibile vendite (aliquote determinate/miste/presunte)', imponibileVendite, 'Registro Corrispettivi §8'],
        ['IVA a debito vendite', ivaDebitoVendite, 'Registro Corrispettivi §8'],
        [
            'Imponibile acquisti (totale foglio Acquisti post §6.4)',
            acquistiImponibileCents,
            'foglio Acquisti',
        ],
        ['IVA a credito acquisti (documenti italiani)', ivaCreditoAcquisti, 'foglio Acquisti'],
        ['IVA reverse charge — a debito', ivaRc, 'autofatture foglio Acquisti'],
        [
            'IVA reverse charge — a credito',
            ivaRc,
            'autofatture foglio Acquisti (stesso importo)',
        ],
        ['IVA a debito complessiva', ivaDebitoTot, 'vendite + reverse charge'],
        ['IVA a credito complessiva', ivaCreditoTot, 'acquisti + reverse charge'],
        ['Saldo del periodo (debito − credito)', saldoIva, '§4.2'],
    ];
    for (const [voce, cents, fonte] of ivaRows) {
        const r = ws.addRow([voce, euroNum(cents), fonte]);
        applyBorders(r);
        r.getCell(2).numFmt = EUR_FORMAT;
    }
    ws.addRow([]);

    // --- 4.3 Raccordo finanziario ---
    ws.addRow(['4.3 Raccordo finanziario']).getCell(1).font = {
        bold: true,
        size: 12,
        name: 'Calibri',
    };
    const bank = await loadBankRaccordo(report);
    styleHeaderRow(ws.addRow(['Voce', 'Importo EUR', 'Nota']));
    const calcSaldo =
        bank.openingCents != null
            ? bank.openingCents + bank.entrataCents - bank.uscitaCents
            : null;
    const raccordo: Array<[string, number | null, string]> = [
        ['Saldo banca a inizio periodo (dichiarato)', bank.openingCents, bank.fileName],
        ['Totale entrate', bank.entrataCents, 'estratto'],
        ['Totale uscite', bank.uscitaCents, 'estratto'],
        ['Saldo calcolato', calcSaldo, 'inizio + entrate − uscite'],
        ['Saldo banca a fine periodo (dichiarato)', bank.closingCents, bank.fileName],
        ['Differenza (deve essere zero)', bank.diffCents, 'C3'],
    ];
    for (const [voce, cents, nota] of raccordo) {
        const r = ws.addRow([voce, cents == null ? 'n/d' : euroNum(cents), nota]);
        applyBorders(r);
        if (cents != null) r.getCell(2).numFmt = EUR_FORMAT;
        if (voce.startsWith('Differenza') && cents != null && cents !== 0) {
            r.getCell(2).font = {
                bold: true,
                color: { argb: 'FFB91C1C' },
                name: 'Calibri',
                size: 10,
            };
        }
    }
    ws.addRow([]);

    // --- 4.4 Conto economico ---
    ws.addRow(['4.4 Conto economico del periodo']).getCell(1).font = {
        bold: true,
        size: 12,
        name: 'Calibri',
    };
    styleHeaderRow(ws.addRow(['Voce', 'Importo EUR', 'Nota']));
    const ricavi = report.summary.corrispettiviLordoCents;
    const costiFioristi = report.summary.floristCompensiCents;
    const costiFee = report.summary.gatewayFeesCents;
    const ceRows: Array<[string, number, string]> = [
        ['Ricavi (incassi clienti lordi)', ricavi, 'esclusi payout e partite di giro'],
        ['Costi del venduto (fioristi)', costiFioristi, 'compensi competenza periodo'],
        ['Commissioni gateway', costiFee, 'fee trattenute'],
        [
            'Risultato parziale (ricavi − fioristi − fee)',
            ricavi - costiFioristi - costiFee,
            'non include ancora tutti i costi da Acquisti/PN',
        ],
    ];
    for (const [voce, cents, nota] of ceRows) {
        const r = ws.addRow([voce, euroNum(cents), nota]);
        applyBorders(r);
        r.getCell(2).numFmt = EUR_FORMAT;
    }
    ws.addRow([
        '',
        'Esclusi dal CE: partite di giro (transito gateway↔banca), movimenti patrimoniali, righe tecniche gateway (§6.3).',
    ]).getCell(2).font = {
        italic: true,
        name: 'Calibri',
        size: 9,
        color: { argb: 'FF64748B' },
    };

    ws.addRow([]);
    ws.addRow(['Tracciabilità (§12)']).getCell(1).font = { bold: true, name: 'Calibri', size: 11 };
    ws.addRow([`Generato: ${new Date().toISOString()}`]);
    ws.addRow([`Metodo: v${DOSSIER_METHOD_VERSION}`]);
    ws.addRow([`Periodo: ${report.bounds.label}`]);
    ws.addRow([`Fonte estratto: ${bank.fileName}`]);
    ws.addRow([
        `Imponibile Acquisti post §6.4: € ${euroLabel(acquistiImponibileCents)}`,
    ]);

    autofitColumns(ws, 12, 64);
}

function buildEccezioniSheet(wb: ExcelJS.Workbook, exceptions: DossierExceptionRow[]) {
    const ws = wb.addWorksheet('Eccezioni');
    const headers = ['Cosa', 'Dove', 'Importo EUR', 'Perché non riconciliato'];
    styleHeaderRow(ws.addRow(headers));

    if (exceptions.length === 0) {
        const r = ws.addRow([
            '(nessuna eccezione)',
            '—',
            '',
            'Il sistema non ha eccezioni da dichiarare in questo periodo.',
        ]);
        applyBorders(r);
    } else {
        for (const e of exceptions) {
            const r = ws.addRow([
                e.cosa,
                e.dove,
                euroNum(e.importoCents),
                e.perche,
            ]);
            applyBorders(r);
            r.getCell(3).numFmt = EUR_FORMAT;
        }
    }

    autofitColumns(ws, 14, 72);
    ws.views = [{ state: 'frozen', ySplit: 1 }];
}

async function buildStripeSheet(wb: ExcelJS.Workbook, report: TaxQuarterlyReport) {
    const moves = await prisma.stripeFinanceMovement.findMany({
        where: {
            createdAtStripe: { gte: report.bounds.start, lte: report.bounds.end },
        },
        orderBy: { createdAtStripe: 'asc' },
        take: 5000,
    });

    const orderIds = [...new Set(moves.map((m) => m.orderId).filter(Boolean))] as string[];
    const orders =
        orderIds.length > 0
            ? await prisma.order.findMany({
                  where: { id: { in: orderIds } },
                  select: { id: true, orderNumber: true },
              })
            : [];
    const orderMap = new Map(orders.map((o) => [o.id, o.orderNumber || o.id]));

    const payouts = moves.filter((m) => /payout/i.test(m.type || ''));
    const payoutByDay = new Map<string, (typeof moves)[number]>();
    for (const p of payouts) {
        const day = p.createdAtStripe.toISOString().slice(0, 10);
        payoutByDay.set(day, p);
    }

    const ws = wb.addWorksheet('Dettaglio Gateway Stripe');
    const headers = [
        'Data',
        'ID Transazione Stripe',
        'Ordine FloreMoria',
        'Importo Lordo Cliente EUR',
        'Commissione Trattenuta (Fee) EUR',
        'Importo Netto EUR',
        'Payout verso Fineco (ID / Data)',
        'Tipo',
    ];
    styleHeaderRow(ws.addRow(headers));

    for (const m of moves) {
        const day = m.createdAtStripe.toISOString().slice(0, 10);
        const gross = Math.abs(m.amountCents || 0);
        const fee = Math.abs(m.feeCents || 0);
        const net = Math.abs(m.netCents != null ? m.netCents : gross - fee);
        const payout =
            (m.payoutId && moves.find((x) => x.stripeId === m.payoutId || x.payoutId === m.payoutId)) ||
            payoutByDay.get(day);
        const payoutRef = m.payoutId
            ? `${m.payoutId}${payout ? ` / ${payout.createdAtStripe.toISOString().slice(0, 10)}` : ''}`
            : payout
              ? `${payout.stripeId} / ${payout.createdAtStripe.toISOString().slice(0, 10)}`
              : '';

        const row = ws.addRow([
            day,
            m.stripeId || m.id,
            m.orderId ? orderMap.get(m.orderId) || m.orderId : '',
            euroNum(gross),
            euroNum(fee),
            euroNum(net),
            payoutRef,
            m.type || '',
        ]);
        applyBorders(row);
        row.getCell(4).numFmt = EUR_FORMAT;
        row.getCell(5).numFmt = EUR_FORMAT;
        row.getCell(6).numFmt = EUR_FORMAT;
    }

    appendSumRow(ws, 3, [4, 5, 6], 'TOTALE');
    autofitColumns(ws);
    ws.views = [{ state: 'frozen', ySplit: 1 }];
}

async function buildPaypalSheet(wb: ExcelJS.Workbook, report: TaxQuarterlyReport) {
    const entries = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceType: 'PAYPAL_MOVEMENT',
            accountingDate: { gte: report.bounds.start, lte: report.bounds.end },
        },
        orderBy: { accountingDate: 'asc' },
        take: 5000,
    });

    // Fineco SDD/payout match per importo±giorni (riferimento pareggio)
    const bankLines = await prisma.bankStatementLine.findMany({
        where: {
            OR: [
                { accountingDate: { gte: report.bounds.start, lte: report.bounds.end } },
                {
                    AND: [
                        { accountingDate: null },
                        { valueDate: { gte: report.bounds.start, lte: report.bounds.end } },
                    ],
                },
            ],
            description: { contains: 'PAYPAL', mode: 'insensitive' },
        },
        select: {
            id: true,
            accountingDate: true,
            amountCents: true,
            description: true,
        },
        take: 2000,
    });

    const ws = wb.addWorksheet('Dettaglio Gateway PayPal');
    const headers = [
        'Data',
        'Codice Transazione PayPal',
        'Tipo',
        'Beneficiario',
        'Importo Lordo EUR',
        'Commissione EUR',
        'Netto EUR',
        'Riferimento Pareggio Fineco',
    ];
    styleHeaderRow(ws.addRow(headers));

    for (const e of entries) {
        const parsed = parsePaypalSourceKey(e.sourceKey || '');
        const meta =
            e.metadataJson && typeof e.metadataJson === 'object'
                ? (e.metadataJson as Record<string, unknown>)
                : {};
        const kindRaw = String(meta.movementKind || meta.eventType || e.category || '');
        let tipo = 'Altro';
        if (/PAYOUT|TRASFERIMENTO/i.test(kindRaw) || e.category === 'PAYPAL_PAYOUT') {
            tipo = 'Payout Bancario';
        } else if (/FEE|ONERI/i.test(kindRaw) || e.category === 'ONERI_BANCARI') {
            tipo = 'Fee';
        } else if (e.totalCents > 0 || e.direction === 'ENTRATA') {
            tipo = 'Vendita Corrispettivo';
        } else if (e.totalCents < 0) {
            tipo = 'Acquisto Fornitore';
        }

        const abs = Math.abs(e.totalCents);
        const fee =
            typeof meta.feeCents === 'number'
                ? Math.abs(meta.feeCents)
                : typeof meta.fee_amount === 'number'
                  ? Math.round(Math.abs(meta.fee_amount) * 100)
                  : 0;
        const gross = fee > 0 ? abs + fee : abs;
        const net = abs;

        // Match Fineco: stesso importo entro 7 gg
        const day = e.accountingDate.toISOString().slice(0, 10);
        const dayMs = Date.parse(day);
        let finecoRef = '';
        for (const b of bankLines) {
            if (Math.abs(Math.abs(b.amountCents) - abs) > 1) continue;
            const bDay = (b.accountingDate || '').toString().slice(0, 10);
            const bMs = Date.parse(bDay);
            if (!Number.isFinite(bMs) || !Number.isFinite(dayMs)) continue;
            if (Math.abs(bMs - dayMs) <= 7 * 86400000) {
                finecoRef = `${bDay} · €${euroNum(Math.abs(b.amountCents)).toFixed(2)} · ${(b.description || '').slice(0, 40)}`;
                break;
            }
        }

        const row = ws.addRow([
            day,
            parsed?.transactionId || e.sourceId || e.sourceKey || '',
            tipo,
            e.counterpartyName || '',
            euroNum(e.totalCents >= 0 ? gross : -gross),
            euroNum(fee),
            euroNum(e.totalCents >= 0 ? net : -net),
            finecoRef,
        ]);
        applyBorders(row);
        row.getCell(5).numFmt = EUR_FORMAT;
        row.getCell(6).numFmt = EUR_FORMAT;
        row.getCell(7).numFmt = EUR_FORMAT;
    }

    appendSumRow(ws, 4, [5, 6, 7], 'TOTALE');
    autofitColumns(ws);
    ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function buildRegistroCorrispettiviSheet(wb: ExcelJS.Workbook, report: TaxQuarterlyReport) {
    const ws = wb.addWorksheet('Registro Corrispettivi');
    const headers = [
        'Data',
        'Canale incasso',
        'Numero ordine',
        'Riferimento transazione gateway',
        'Importo listino EUR',
        'Sconto o buono EUR',
        'Incassato lordo EUR',
        'Aliquota %',
        'Imponibile EUR',
        'IVA EUR',
        'Certezza aliquota',
        'Nota regola',
    ];
    styleHeaderRow(ws.addRow(headers));

    for (const r of report.corrispettivi) {
        const row = ws.addRow([
            r.paymentDate || r.date,
            r.gateway,
            r.orderNumber,
            r.transactionId || '',
            euroNum(r.listinoCents ?? r.grossCents),
            euroNum(r.scontoCents ?? 0),
            euroNum(r.grossCents),
            r.vatRate || '',
            r.vatCertainty === 'MANCANTE' ? '' : euroNum(r.imponibileCents),
            r.vatCertainty === 'MANCANTE' ? '' : euroNum(r.ivaDebitoCents),
            r.vatCertainty || '',
            r.vatRuleNote || '',
        ]);
        applyBorders(row);
        for (const col of [5, 6, 7, 9, 10]) {
            row.getCell(col).numFmt = EUR_FORMAT;
        }
        if (r.vatCertainty === 'MANCANTE') {
            row.getCell(11).font = { bold: true, color: { argb: 'FFB91C1C' }, name: 'Calibri', size: 10 };
        }
    }

    appendSumRow(ws, 6, [5, 6, 7, 9, 10], 'TOTALE (righe in foglio)');
    autofitColumns(ws, 10, 36);
    ws.views = [{ state: 'frozen', ySplit: 1 }];
}

/**
 * Genera il buffer .xlsx del Dossier Fiscale (METODO v1.7).
 */
export async function buildTaxQuarterlyXlsxBuffer(report: TaxQuarterlyReport): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'FloreMoria';
    wb.created = new Date();
    wb.modified = new Date();
    wb.description = `${DOSSIER_VERSION} · ${report.bounds.label}`;

    const year = report.bounds.year;
    const quarter = report.bounds.quarter as TaxQuarter;

    const { rows: acquistiRows, exceptions: acquisizioneExceptions } =
        await resolveAcquistiSheetRows(report);
    const acquistiImponibileCents = sumAcquistiImponibileCents(acquistiRows);
    const italianAcquistiIvaCents = acquistiRows
        .filter((r) => !/autofattura/i.test(r.tipoDocumento))
        .reduce((s, r) => s + Math.max(0, r.ivaCents), 0);
    const ivaRcFromAcquistiCents = acquistiRows
        .filter((r) => /autofattura/i.test(r.tipoDocumento))
        .reduce((s, r) => s + Math.max(0, r.ivaCents), 0);

    const controls = await runAllDossierControls(year, quarter);

    const controlExceptions: DossierExceptionRow[] = controls
        .filter((c) => !c.passed)
        .map((c) => ({
            cosa: `${c.id} — ${c.name}`,
            dove: 'Quadratura §4.1',
            importoCents: c.unit === 'cents' && Number.isFinite(c.delta) ? c.delta : 0,
            perche: c.detail || `controllo fallito (misurato=${c.measured}, atteso=${c.expected})`,
        }));

    await buildQuadraturaSheet(
        wb,
        report,
        controls,
        acquistiImponibileCents,
        italianAcquistiIvaCents,
        ivaRcFromAcquistiCents
    );
    buildRegistroCorrispettiviSheet(wb, report);
    await buildPrimaNotaMasterSheet(wb, report);
    await buildFinecoSheet(wb, report);

    {
        const ws = wb.addWorksheet('Acquisti');
        const headers = [
            'Data Documento',
            'Fornitore',
            'P.IVA / CF',
            'Tipo Documento',
            'Numero Documento',
            'Imponibile EUR',
            'Aliquota IVA %',
            'Imposta EUR',
            'Totale Documento EUR',
        ];
        styleHeaderRow(ws.addRow(headers));
        for (const r of acquistiRows) {
            const row = ws.addRow([
                r.date,
                r.vendorName,
                r.vatId,
                r.tipoDocumento,
                r.documentNumber,
                euroNum(r.imponibileCents),
                r.vatRate,
                euroNum(r.ivaCents),
                euroNum(r.totaleCents),
            ]);
            applyBorders(row);
            row.getCell(6).numFmt = EUR_FORMAT;
            row.getCell(8).numFmt = EUR_FORMAT;
            row.getCell(9).numFmt = EUR_FORMAT;
        }
        appendSumRow(ws, 5, [6, 8, 9], 'TOTALE (imponibile post §6.5)');
        autofitColumns(ws);
        ws.views = [{ state: 'frozen', ySplit: 1 }];
    }

    await buildStripeSheet(wb, report);
    await buildPaypalSheet(wb, report);
    buildEccezioniSheet(wb, [
        ...acquisizioneExceptions,
        ...(report.corrispettiviExceptions || []),
        ...controlExceptions,
    ]);

    const arrayBuffer = await wb.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
}

/** Solo verifica: imponibile Acquisti post §6.5 (senza scrivere XLSX). */
export async function measureAcquistiImponibileCents(
    report: TaxQuarterlyReport
): Promise<{ imponibileCents: number; exceptionCount: number }> {
    const { rows, exceptions } = await resolveAcquistiSheetRows(report);
    return {
        imponibileCents: sumAcquistiImponibileCents(rows),
        exceptionCount: exceptions.length,
    };
}
