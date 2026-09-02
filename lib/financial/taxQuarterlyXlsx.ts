/**
 * Dossier Fiscale Completo — workbook Excel multi-foglio per lo studio commercialista.
 * Usa exceljs: intestazioni grassetto, € #,##0.00, auto-fit colonne.
 */

import ExcelJS from 'exceljs';
import type { TaxQuarterlyReport } from '@/lib/financial/taxQuarterly';
import { VAT_PCT_ORDINARY } from '@/lib/financial/vat';
import {
    listHistoricalLedgerEntries,
    type HistoricalLedgerFilters,
} from '@/lib/financial/historicalLedgerQuery';
import {
    CATEGORY_LABELS,
    type LedgerCategory,
} from '@/lib/financial/historicalLedgerTypes';
import {
    labelReconciliationStatusIt,
    labelSourceTypeIt,
} from '@/lib/financial/fiscalItalianLabels';

const HEADER_FILL: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF3F0EA' },
};

const HEADER_FONT: Partial<ExcelJS.Font> = {
    bold: true,
    color: { argb: 'FF334155' },
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
const DOSSIER_VERSION = 'dossier-fiscale-v2';

function euroNum(cents: number): number {
    // Centesimi interi → euro con 2 decimali esatti (29.99, non 30.00).
    return Number((Number(cents) / 100).toFixed(2));
}

function styleHeaderRow(row: ExcelJS.Row) {
    row.eachCell((cell) => {
        cell.fill = HEADER_FILL;
        cell.font = HEADER_FONT;
        cell.border = THIN_BORDER;
        cell.alignment = { vertical: 'middle', wrapText: true };
    });
    row.height = 22;
}

function applyEuroFormat(ws: ExcelJS.Worksheet, colIndexes: number[]) {
    ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        for (const col of colIndexes) {
            const cell = row.getCell(col);
            if (typeof cell.value === 'number') {
                cell.numFmt = EUR_FORMAT;
            }
        }
    });
}

function autofitColumns(ws: ExcelJS.Worksheet, min = 10, max = 42) {
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

function appendSheetFromRecords(
    wb: ExcelJS.Workbook,
    name: string,
    rows: Record<string, string | number | null | undefined>[],
    euroCols: string[] = []
) {
    const ws = wb.addWorksheet(name.slice(0, 31));
    if (!rows.length) {
        ws.addRow(['Nessun dato nel periodo']);
        autofitColumns(ws);
        return ws;
    }

    const headers = Object.keys(rows[0]!);
    const headerRow = ws.addRow(headers);
    styleHeaderRow(headerRow);

    const euroIdx = euroCols
        .map((h) => headers.indexOf(h) + 1)
        .filter((i) => i > 0);

    for (const record of rows) {
        const values = headers.map((h) => {
            const v = record[h];
            return v === null || v === undefined ? '' : v;
        });
        const row = ws.addRow(values);
        row.eachCell((cell) => {
            cell.border = THIN_BORDER;
            cell.font = { name: 'Calibri', size: 10 };
        });
    }

    applyEuroFormat(ws, euroIdx);
    autofitColumns(ws);
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    return ws;
}

async function buildPrimaNotaRows(report: TaxQuarterlyReport) {
    const filters: HistoricalLedgerFilters = {
        fiscalYear: report.bounds.year,
        fiscalQuarter: report.bounds.quarter,
        // Se il label è mensile (MM/YYYY), filtra per periodKey mese
        month: /^\d{2}\/\d{4}$/.test(report.bounds.label)
            ? Number(report.bounds.label.slice(0, 2))
            : null,
        direction: 'ALL',
        take: 2000,
        skip: 0,
    };

    const { rows } = await listHistoricalLedgerEntries(filters);

    // Cronologico crescente + saldo progressivo (solo movimenti con segno)
    const chronological = [...rows].sort(
        (a, b) => a.accountingDate.getTime() - b.accountingDate.getTime()
    );

    let running = 0;
    return chronological.map((r) => {
        const signed =
            r.direction === 'ENTRATA'
                ? r.totalCents
                : r.direction === 'USCITA'
                  ? -Math.abs(r.totalCents)
                  : r.totalCents;
        running += signed;
        const entrata = r.direction === 'ENTRATA' ? euroNum(Math.abs(r.totalCents)) : 0;
        const uscita = r.direction === 'USCITA' ? euroNum(Math.abs(r.totalCents)) : 0;
        return {
            Data: r.accountingDate.toISOString().slice(0, 10),
            Causale: r.description || '',
            Entrata: entrata || '',
            Uscita: uscita || '',
            'Conto / Gateway': labelSourceTypeIt(r.sourceType),
            Categoria: CATEGORY_LABELS[r.category as LedgerCategory] || r.category,
            Controparte: r.counterpartyName || '',
            'Rif. Ordine / Doc': r.orderId || r.documentRef || '',
            'TRN / Source ID': r.sourceId || r.bankLineId || '',
            'Stato Riconciliazione': labelReconciliationStatusIt(r.reconciliationStatus),
            'Saldo Progressivo EUR': euroNum(running),
        };
    });
}

/**
 * Genera il buffer .xlsx del Dossier Fiscale Completo (6 fogli).
 */
export async function buildTaxQuarterlyXlsxBuffer(report: TaxQuarterlyReport): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'FloreMoria';
    wb.created = new Date();
    wb.modified = new Date();

    const s = report.ivaSummary;
    const riepilogoRows = [
        { Voce: 'Periodo', Valore: report.bounds.label },
        { Voce: 'Totale Corrispettivi Lordi EUR', Valore: euroNum(s.corrispettiviLordoCents) },
        { Voce: 'Imponibile Vendite IVA 10% EUR', Valore: euroNum(s.imponibileVendite10Cents) },
        { Voce: 'IVA a Debito Vendite 10% EUR', Valore: euroNum(s.ivaDebitoVendite10Cents) },
        {
            Voce: 'Totale Autofatture Reverse Charge (Imponibile fee gateway) EUR',
            Valore: euroNum(s.reverseChargeImponibileCents),
        },
        {
            Voce: `IVA Reverse Charge TD17 ${VAT_PCT_ORDINARY}% EUR`,
            Valore: euroNum(s.reverseChargeIvaCents),
        },
        {
            Voce: 'Totale Costo Fioristi — Imponibile passivo EUR',
            Valore: euroNum(s.floristImponibileCents),
        },
        {
            Voce: 'Totale Costo Fioristi — IVA a credito detraibile EUR',
            Valore: euroNum(s.floristIvaCreditoCents),
        },
        {
            Voce: 'Saldo IVA stimato a Debito (+) / Credito (-) EUR',
            Valore: euroNum(s.saldoIvaStimatoCents),
        },
        { Voce: 'N. corrispettivi', Valore: report.corrispettivi.length },
        { Voce: 'N. reverse charge', Valore: report.reverseCharge.length },
        { Voce: 'N. passivo fioristi', Valore: report.floristPassivo.length },
    ];

    // Tab 1 — frontespizio IVA
    {
        const ws = wb.addWorksheet('Riepilogo_IVA_Periodo');
        const header = ws.addRow(['Voce', 'Valore']);
        styleHeaderRow(header);
        for (const row of riepilogoRows) {
            const r = ws.addRow([row.Voce, row.Valore]);
            r.eachCell((cell) => {
                cell.border = THIN_BORDER;
                cell.font = { name: 'Calibri', size: 10 };
            });
            if (typeof row.Valore === 'number' && String(row.Voce).includes('EUR')) {
                r.getCell(2).numFmt = EUR_FORMAT;
            }
        }
        autofitColumns(ws, 12, 55);
        ws.views = [{ state: 'frozen', ySplit: 1 }];
    }

    // Tab 2 — Prima Nota
    const primaNotaRows = await buildPrimaNotaRows(report);
    appendSheetFromRecords(wb, 'Prima_Nota', primaNotaRows, [
        'Entrata',
        'Uscita',
        'Saldo Progressivo EUR',
    ]);

    // Tab 3 — Corrispettivi
    const corrispettiviRows = report.corrispettivi.map((r) => ({
        'Data Pagamento': r.paymentDate,
        'ID Ordine': r.orderNumber,
        Gateway: r.gateway,
        'ID Transazione Gateway': r.transactionId,
        Cliente: r.buyerName,
        'CF/P.IVA Cliente': r.buyerTaxId,
        Nazione: r.buyerCountry,
        'Lordo EUR': euroNum(r.grossCents),
        'Aliquota IVA %': r.vatRate,
        'Imponibile EUR': euroNum(r.imponibileCents),
        'IVA EUR': euroNum(r.ivaDebitoCents),
        'Fee Gateway EUR': euroNum(r.gatewayFeeCents),
        'Incasso Netto EUR': euroNum(r.netCents),
        'Metodo Pagamento': r.paymentMethod,
    }));
    appendSheetFromRecords(wb, 'Registro_Corrispettivi', corrispettiviRows, [
        'Lordo EUR',
        'Imponibile EUR',
        'IVA EUR',
        'Fee Gateway EUR',
        'Incasso Netto EUR',
    ]);

    // Tab 4 — Reverse Charge
    const reverseChargeRows = report.reverseCharge.map((r) => ({
        'Mese Competenza': r.competenceMonth,
        Fornitore: r.vendorName,
        'Partita IVA / Tax ID Estero': r.vendorTaxId,
        'N. Fattura Gateway': r.gatewayInvoiceNumber,
        'Data Emissione': r.issuedAt,
        'Imponibile Fee EUR': euroNum(r.taxableFeeCents),
        'Aliquota IVA %': VAT_PCT_ORDINARY,
        'IVA Reverse Charge EUR': euroNum(r.vatReverseChargeCents),
        'Riferimento Autofattura TD17': r.autofatturaTd17Ref,
    }));
    appendSheetFromRecords(wb, 'Reverse_Charge_SaaS_Gateway', reverseChargeRows, [
        'Imponibile Fee EUR',
        'IVA Reverse Charge EUR',
    ]);

    // Tab 5 — Passivo fioristi
    const floristRows = report.floristPassivo.map((r) => ({
        'ID Ordine': r.orderNumber,
        'Fiorista Partner': r.partnerName,
        'P.IVA / CF Fiorista': r.partnerTaxId || '',
        IBAN: r.partnerIban || '',
        'Compenso Pattuito EUR': euroNum(r.compensoConcordatoCents),
        'Data Bonifico Fineco': r.bonificoDate || '',
        'TRN Bonifico': r.bonificoTrn || '',
        'N. Fattura Passiva SDI': r.sdiInvoiceNumber || '',
        'Data SDI': r.sdiDate || '',
        'Imponibile Passivo EUR': euroNum(r.imponibilePassivoCents),
        'IVA Passiva EUR': euroNum(r.ivaPassivaCents),
        'Totale Fattura Fiorista EUR': euroNum(r.totaleFatturaCents),
    }));
    appendSheetFromRecords(wb, 'Compensi_Fioristi_Passivo', floristRows, [
        'Compenso Pattuito EUR',
        'Imponibile Passivo EUR',
        'IVA Passiva EUR',
        'Totale Fattura Fiorista EUR',
    ]);

    // Tab 6 — Meta
    {
        const ws = wb.addWorksheet('_Meta');
        const header = ws.addRow(['Campo', 'Valore']);
        styleHeaderRow(header);
        const meta = [
            ['Versione tracciato', DOSSIER_VERSION],
            ['Periodo', report.bounds.label],
            ['Dal', report.bounds.start.toISOString().slice(0, 10)],
            ['Al', report.bounds.end.toISOString().slice(0, 10)],
            ['Anno', report.bounds.year],
            ['Trimestre di riferimento', report.bounds.quarter],
            ['Data estrazione', new Date().toISOString().slice(0, 19)],
            ['Timezone', 'Europe/Rome (date contabili localizzate lato DB)'],
            ['Fogli', 'Riepilogo_IVA_Periodo; Prima_Nota; Registro_Corrispettivi; Reverse_Charge_SaaS_Gateway; Compensi_Fioristi_Passivo; _Meta'],
        ];
        for (const [k, v] of meta) {
            const r = ws.addRow([k, v]);
            r.eachCell((cell) => {
                cell.border = THIN_BORDER;
                cell.font = { name: 'Calibri', size: 10 };
            });
        }
        autofitColumns(ws, 14, 80);
    }

    const arrayBuffer = await wb.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
}
