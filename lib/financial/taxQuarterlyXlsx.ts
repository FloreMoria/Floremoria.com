/**
 * Dossier Fiscale Completo — workbook Excel a 5 fogli per lo studio commercialista.
 *
 * Fogli:
 *  1. Prima Nota (Master) — vista Fineco-centrica
 *  2. Estratto Conto Fineco — movimenti bancari grezzi
 *  3. Fatture Passive e Autofatture — SDI + TD17/TD18
 *  4. Dettaglio Gateway Stripe
 *  5. Dettaglio Gateway PayPal
 */

import ExcelJS from 'exceljs';
import prisma from '@/lib/prisma';
import type { TaxQuarterlyReport } from '@/lib/financial/taxQuarterly';
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
const DOSSIER_VERSION = 'dossier-fiscale-v3-5fogli';

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

async function buildInvoicesSheet(wb: ExcelJS.Workbook, report: TaxQuarterlyReport) {
    const [manual, saas] = await Promise.all([
        prisma.manualFinanceExpense.findMany({
            where: {
                expenseDate: { gte: report.bounds.start, lte: report.bounds.end },
            },
            orderBy: { expenseDate: 'asc' },
            take: 3000,
        }),
        prisma.saasForeignInvoice.findMany({
            where: {
                invoiceDate: { gte: report.bounds.start, lte: report.bounds.end },
            },
            orderBy: { invoiceDate: 'asc' },
            take: 1000,
        }),
    ]);

    const ws = wb.addWorksheet('Fatture Passive e Autofatture');
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

    for (const e of manual) {
        const meta =
            e.metadataJson && typeof e.metadataJson === 'object'
                ? (e.metadataJson as Record<string, unknown>)
                : {};
        const isTd17 =
            meta.source === 'SDI_AUTOFATTURA_ESTERA' ||
            meta.source === 'AUTOFATTURA_TD17' ||
            meta.isReverseCharge === true ||
            meta.isForeignAutofattura === true;
        const isTd18 = meta.source === 'AUTOFATTURA_TD18';
        const tipo = isTd17
            ? 'Autofattura TD17'
            : isTd18
              ? 'Autofattura TD18'
              : e.docType === 'FATTURA'
                ? 'Fattura SDI / Passiva'
                : e.docType || 'Documento passivo';
        const docNum =
            (typeof meta.invoiceNumber === 'string' && meta.invoiceNumber) ||
            (typeof meta.documentNumber === 'string' && meta.documentNumber) ||
            e.fileName ||
            '';
        const vatId =
            (typeof meta.vendorVat === 'string' && meta.vendorVat) ||
            (typeof meta.vatNumber === 'string' && meta.vatNumber) ||
            '';
        const imponibile = e.netCents ?? Math.round((e.totalCents || 0) / 1.22);
        const iva = e.vatCents ?? Math.max(0, (e.totalCents || 0) - imponibile);
        const row = ws.addRow([
            e.expenseDate.toISOString().slice(0, 10),
            e.vendorName || '',
            vatId,
            tipo,
            docNum,
            euroNum(imponibile),
            e.vatRate ?? (iva > 0 ? 22 : 0),
            euroNum(iva),
            euroNum(e.totalCents || 0),
        ]);
        applyBorders(row);
        row.getCell(6).numFmt = EUR_FORMAT;
        row.getCell(8).numFmt = EUR_FORMAT;
        row.getCell(9).numFmt = EUR_FORMAT;
    }

    for (const s of saas) {
        const tipo =
            s.autofatturaType === 'TD18' || s.jurisdiction === 'UE'
                ? 'Autofattura TD18'
                : 'Autofattura TD17';
        const imponibile = s.eurAmountCents;
        const vatRate = 22;
        const iva = Math.round((imponibile * vatRate) / 100);
        const row = ws.addRow([
            s.invoiceDate.toISOString().slice(0, 10),
            s.vendorName || '',
            '',
            tipo,
            s.fileName || s.id.slice(0, 12),
            euroNum(imponibile),
            vatRate,
            euroNum(iva),
            euroNum(imponibile + iva),
        ]);
        applyBorders(row);
        row.getCell(6).numFmt = EUR_FORMAT;
        row.getCell(8).numFmt = EUR_FORMAT;
        row.getCell(9).numFmt = EUR_FORMAT;
    }

    // Anche reverse charge dal report trimestrale (fee gateway)
    for (const r of report.reverseCharge) {
        const row = ws.addRow([
            r.issuedAt || r.competenceMonth,
            r.vendorName,
            r.vendorTaxId,
            'Autofattura TD17',
            r.autofatturaTd17Ref || r.gatewayInvoiceNumber,
            euroNum(r.taxableFeeCents),
            22,
            euroNum(r.vatReverseChargeCents),
            euroNum(r.taxableFeeCents + r.vatReverseChargeCents),
        ]);
        applyBorders(row);
        row.getCell(6).numFmt = EUR_FORMAT;
        row.getCell(8).numFmt = EUR_FORMAT;
        row.getCell(9).numFmt = EUR_FORMAT;
    }

    appendSumRow(ws, 5, [6, 8, 9], 'TOTALE');
    autofitColumns(ws);
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

/**
 * Genera il buffer .xlsx del Dossier Fiscale Completo (5 fogli).
 */
export async function buildTaxQuarterlyXlsxBuffer(report: TaxQuarterlyReport): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'FloreMoria';
    wb.created = new Date();
    wb.modified = new Date();
    wb.description = `${DOSSIER_VERSION} · ${report.bounds.label}`;

    await buildPrimaNotaMasterSheet(wb, report);
    await buildFinecoSheet(wb, report);
    await buildInvoicesSheet(wb, report);
    await buildStripeSheet(wb, report);
    await buildPaypalSheet(wb, report);

    const arrayBuffer = await wb.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
}
