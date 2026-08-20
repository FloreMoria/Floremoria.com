/**
 * Parser report fatture ricevute (.xlsx / .csv) — colonne fiscali/SDI standard.
 * Perché: gli export YouDoox/SDI in foglio sono più comuni dello ZIP XML per i report mensili.
 */

import Papa from 'papaparse';
import type { ParseFatturaBatchResult, ParsedFatturaPa } from '@/lib/financial/parseFatturaPaXml';

function normKey(k: string): string {
    return k
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function findCol(row: Record<string, unknown>, candidates: string[]): string {
    const keys = Object.keys(row);
    for (const cand of candidates) {
        const hit = keys.find((k) => {
            const n = normKey(k);
            return n === cand || n.includes(cand);
        });
        if (hit && row[hit] != null && String(row[hit]).trim() !== '') {
            return String(row[hit]).trim();
        }
    }
    return '';
}

function parseAmount(raw: unknown): number | null {
    if (raw == null || raw === '') return null;
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    let s = String(raw).trim().replace(/\s/g, '').replace(/€/g, '').replace(/EUR/gi, '');
    if (!s || s === '-') return null;
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.includes(',')) s = s.replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

function parseDate(raw: unknown): string | null {
    if (raw == null || raw === '') return null;
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
        return raw.toISOString().slice(0, 10);
    }
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        // Excel serial
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const XLSX = require('xlsx') as typeof import('xlsx');
        const parsed = XLSX.SSF.parse_date_code(raw);
        if (parsed) {
            return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
        }
    }
    const s = String(raw).trim();
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const it = s.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})$/);
    if (it) {
        const d = Number(it[1]);
        const m = Number(it[2]);
        let y = Number(it[3]);
        if (y < 100) y += 2000;
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    return null;
}

function eurosToCents(euros: number): number {
    return Math.round(euros * 100);
}

function buildDedupeKey(vat: string | null, number: string, date: string): string {
    const v = (vat || 'NOVAT').replace(/\s+/g, '').toUpperCase();
    const n = number.replace(/\s+/g, '').toUpperCase();
    return `${v}|${n}|${date}`;
}

const VENDOR_KEYS = [
    'fornitore / denominazione',
    'fornitore/denominazione',
    'fornitore',
    'denominazione',
    'ragione sociale',
    'cedente',
    'vendor',
    'anagrafica',
];
const VAT_KEYS = [
    'partita iva / cf',
    'partita iva/cf',
    'partita iva',
    'p.iva',
    'piva',
    'id fiscale',
    'codice fiscale',
    'cf',
    'vat',
];
const DATE_KEYS = [
    'data documento',
    'data fattura',
    'data emissione',
    'data',
];
const NUMBER_KEYS = [
    'numero fattura',
    'n. fattura',
    'numero documento',
    'n. documento',
    'numero',
    'n doc',
];
const NET_KEYS = ['imponibile', 'imponibileimporto', 'netto', 'imponibile €'];
const VAT_AMT_KEYS = ['iva / imposta', 'iva/imposta', 'imposta', 'iva', 'imposta iva'];
const TOTAL_KEYS = [
    'totale documento',
    'importo totale',
    'totale',
    'importo',
    'importototaledocumento',
];

const TYPE_KEYS = [
    'tipo documento',
    'tipo',
    'tipodocumento',
    'tipo doc',
    'documento',
];
const RELATED_KEYS = [
    'fattura collegata',
    'riferimento fattura',
    'n. fattura collegata',
    'documento collegato',
];

function rowToInvoice(
    row: Record<string, unknown>,
    idx: number,
    sourceFileName: string
): ParsedFatturaPa | { error: string } {
    const vendorName = findCol(row, VENDOR_KEYS) || 'Fornitore SDI';
    const vendorVatRaw = findCol(row, VAT_KEYS);
    const vendorVat = vendorVatRaw ? vendorVatRaw.replace(/\s+/g, '').toUpperCase() : null;
    const invoiceNumber = findCol(row, NUMBER_KEYS);
    const invoiceDate = parseDate(findCol(row, DATE_KEYS) || findCol(row, ['data']));
    const totalEuros = parseAmount(findCol(row, TOTAL_KEYS));
    const netEuros = parseAmount(findCol(row, NET_KEYS)) || 0;
    const vatEuros = parseAmount(findCol(row, VAT_AMT_KEYS)) || 0;
    const tipoRaw = findCol(row, TYPE_KEYS);
    const relatedInvoiceNumber = findCol(row, RELATED_KEYS) || null;

    if (!invoiceNumber || !invoiceDate) {
        return { error: `Riga ${idx + 1}: numero/data documento mancanti` };
    }
    let total = totalEuros;
    if (total == null || total === 0) {
        if (netEuros !== 0 || vatEuros !== 0) total = netEuros + vatEuros;
    }
    if (total == null || total === 0) {
        return { error: `Riga ${idx + 1}: totale documento assente` };
    }

    const isCreditNote =
        /TD04|NOTA\s*DI\s*CREDITO|CREDITO|NC\b/i.test(tipoRaw) ||
        total < 0;
    const sign = isCreditNote ? -1 : 1;
    const totalAbs = eurosToCents(Math.abs(total));
    const vatRate =
        Math.abs(netEuros) > 0 && Math.abs(vatEuros) > 0
            ? Math.round((Math.abs(vatEuros) / Math.abs(netEuros)) * 10000) / 100
            : 22;
    const vatAbs =
        vatEuros !== 0
            ? eurosToCents(Math.abs(vatEuros))
            : Math.round(totalAbs - totalAbs / (1 + vatRate / 100));
    const netAbs = netEuros !== 0 ? eurosToCents(Math.abs(netEuros)) : totalAbs - vatAbs;
    const docKind: ParsedFatturaPa['docKind'] = sign < 0 ? 'NOTA_CREDITO' : 'FATTURA';
    const label = docKind === 'NOTA_CREDITO' ? 'Nota di credito' : 'Fattura';

    return {
        vendorName: vendorName.slice(0, 160),
        vendorVat,
        invoiceNumber: invoiceNumber.slice(0, 64),
        invoiceDate,
        totalCents: sign * totalAbs,
        netCents: sign * Math.max(0, netAbs),
        vatCents: sign * Math.max(0, vatAbs),
        vatRate,
        causale: `${label} n. ${invoiceNumber} — ${vendorName}`.slice(0, 2000),
        lineDescriptions: [],
        sourceFileName: `${sourceFileName}#${idx + 1}`,
        dedupeKey: buildDedupeKey(vendorVat, invoiceNumber, invoiceDate),
        docKind,
        relatedInvoiceNumber,
    };
}

function parseRows(
    rows: Record<string, unknown>[],
    sourceFileName: string
): ParseFatturaBatchResult {
    const invoices: ParsedFatturaPa[] = [];
    const skipped: ParseFatturaBatchResult['skipped'] = [];
    const warnings: string[] = [];

    rows.forEach((row, idx) => {
        const cleaned: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) {
            if (!k || k.startsWith('__')) continue;
            cleaned[k] = v;
        }
        const result = rowToInvoice(cleaned, idx, sourceFileName);
        if ('error' in result) {
            skipped.push({ fileName: `${sourceFileName}#${idx + 1}`, reason: result.error });
            return;
        }
        invoices.push(result);
    });

    if (!invoices.length) {
        warnings.push(
            'Nessuna fattura riconosciuta. Verifica colonne: Fornitore, P.IVA, Data Documento, Numero Fattura, Totale Documento.'
        );
    }
    return { invoices, skipped, warnings };
}

export function parseReceivedInvoicesCsv(
    buffer: Buffer,
    sourceFileName = 'report.csv'
): ParseFatturaBatchResult {
    const text = buffer.toString('utf-8').replace(/^\uFEFF/, '');
    const delimiter = text.split('\n')[0]?.includes(';') ? ';' : ',';
    const parsed = Papa.parse<Record<string, unknown>>(text, {
        header: true,
        skipEmptyLines: true,
        delimiter,
        dynamicTyping: false,
    });
    return parseRows(parsed.data || [], sourceFileName);
}

export async function parseReceivedInvoicesXlsx(
    buffer: Buffer,
    sourceFileName = 'report.xlsx'
): Promise<ParseFatturaBatchResult> {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) {
        return {
            invoices: [],
            skipped: [],
            warnings: ['Workbook Excel vuoto'],
        };
    }
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    return parseRows(rows, sourceFileName);
}

export async function parseReceivedInvoicesReport(
    buffer: Buffer,
    fileName: string,
    contentType?: string
): Promise<ParseFatturaBatchResult> {
    const lower = fileName.toLowerCase();
    const ct = (contentType || '').toLowerCase();
    if (lower.endsWith('.csv') || ct.includes('csv') || ct.includes('text/plain')) {
        return parseReceivedInvoicesCsv(buffer, fileName);
    }
    if (
        lower.endsWith('.xlsx') ||
        lower.endsWith('.xls') ||
        ct.includes('spreadsheet') ||
        ct.includes('excel')
    ) {
        return parseReceivedInvoicesXlsx(buffer, fileName);
    }
    // Tentativo CSV di default
    return parseReceivedInvoicesCsv(buffer, fileName);
}
