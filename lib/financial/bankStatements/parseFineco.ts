/**
 * Parser estratti conto FinecoBank (CSV / Excel / PDF testo).
 * Perché: normalizzare formati export banca → movimenti firmati per riconciliazione.
 */

import Papa from 'papaparse';
import type { ParseBankStatementResult, ParsedBankMovement } from './types';

const DATE_KEYS = [
    'data contabile',
    'data contab',
    'accounting date',
    'data',
    'data operazione',
    'data registrazione',
];
const VALUE_DATE_KEYS = ['data valuta', 'value date', 'valuta'];
const DESC_KEYS = [
    'descrizione',
    'causale',
    'description',
    'dettaglio',
    'movimento',
    'descrizione completa',
];
const CREDIT_KEYS = ['entrate', 'avere', 'credit', 'accrediti', 'importo avere'];
const DEBIT_KEYS = ['uscite', 'dare', 'debit', 'addebiti', 'importo dare'];
const AMOUNT_KEYS = ['importo', 'amount', 'euro'];
const BALANCE_KEYS = ['saldo', 'saldo progressivo', 'balance', 'saldo contabile'];

function normKey(k: string): string {
    return k
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function findCol(row: Record<string, unknown>, candidates: string[]): string | null {
    const keys = Object.keys(row);
    for (const cand of candidates) {
        const hit = keys.find((k) => normKey(k) === cand || normKey(k).includes(cand));
        if (hit) return hit;
    }
    return null;
}

function parseItalianNumber(raw: unknown): number | null {
    if (raw == null || raw === '') return null;
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    let s = String(raw).trim();
    if (!s || s === '-' || s === '—') return null;
    s = s.replace(/\s/g, '').replace(/€/g, '').replace(/EUR/gi, '');
    // 1.234,56 → 1234.56 ; 1234.56 resta
    if (s.includes(',') && s.includes('.')) {
        s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.includes(',')) {
        s = s.replace(',', '.');
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

function parseFinecoDate(raw: unknown): string | null {
    if (raw == null || raw === '') return null;
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
        return raw.toISOString().slice(0, 10);
    }
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        // Excel serial date — lazy import evita crash di bundling a cold start
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const XLSX = require('xlsx') as typeof import('xlsx');
        const parsed = XLSX.SSF.parse_date_code(raw);
        if (parsed) {
            const mm = String(parsed.m).padStart(2, '0');
            const dd = String(parsed.d).padStart(2, '0');
            return `${parsed.y}-${mm}-${dd}`;
        }
    }
    const s = String(raw).trim();
    const it = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (it) {
        const d = Number(it[1]);
        const m = Number(it[2]);
        let y = Number(it[3]);
        if (y < 100) y += 2000;
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    return null;
}

function eurosToCents(euros: number): number {
    return Math.round(euros * 100);
}

function rowToMovement(
    row: Record<string, unknown>,
    lineIndex: number
): ParsedBankMovement | null {
    const dateCol = findCol(row, DATE_KEYS);
    const valueCol = findCol(row, VALUE_DATE_KEYS);
    const descCol = findCol(row, DESC_KEYS);
    const creditCol = findCol(row, CREDIT_KEYS);
    const debitCol = findCol(row, DEBIT_KEYS);
    const amountCol = findCol(row, AMOUNT_KEYS);
    const balanceCol = findCol(row, BALANCE_KEYS);

    const accountingDate = dateCol ? parseFinecoDate(row[dateCol]) : null;
    const valueDate = valueCol ? parseFinecoDate(row[valueCol]) : accountingDate;
    const description = descCol ? String(row[descCol] ?? '').trim() : '';

    const credit = creditCol ? parseItalianNumber(row[creditCol]) : null;
    const debit = debitCol ? parseItalianNumber(row[debitCol]) : null;
    let amountEuros: number | null = null;

    if (credit != null && credit !== 0) amountEuros = Math.abs(credit);
    else if (debit != null && debit !== 0) amountEuros = -Math.abs(debit);
    else if (amountCol) {
        const a = parseItalianNumber(row[amountCol]);
        if (a != null) amountEuros = a;
    }

    if (amountEuros == null || amountEuros === 0) {
        // Riga intestazione / vuota
        if (!description && !accountingDate) return null;
        return null;
    }

    const balance = balanceCol ? parseItalianNumber(row[balanceCol]) : null;

    return {
        lineIndex,
        valueDate,
        accountingDate: accountingDate || valueDate,
        description: description || 'Movimento senza causale',
        amountCents: eurosToCents(amountEuros),
        debitCents: debit != null && debit !== 0 ? eurosToCents(Math.abs(debit)) : null,
        creditCents: credit != null && credit !== 0 ? eurosToCents(Math.abs(credit)) : null,
        balanceCents: balance != null ? eurosToCents(balance) : null,
        raw: row,
    };
}

function finalize(movements: ParsedBankMovement[], warnings: string[]): ParseBankStatementResult {
    const dates = movements
        .map((m) => m.accountingDate || m.valueDate)
        .filter((d): d is string => Boolean(d))
        .sort();
    const withBalance = [...movements].reverse().find((m) => m.balanceCents != null);
    return {
        movements,
        periodStart: dates[0] || null,
        periodEnd: dates[dates.length - 1] || null,
        closingBalanceCents: withBalance?.balanceCents ?? null,
        warnings,
    };
}

function parseTabularRows(rows: Record<string, unknown>[]): ParseBankStatementResult {
    const warnings: string[] = [];
    const movements: ParsedBankMovement[] = [];
    let idx = 0;
    for (const row of rows) {
        const cleaned: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) {
            if (!k || k.startsWith('__')) continue;
            cleaned[k] = v;
        }
        const m = rowToMovement(cleaned, idx);
        if (m) {
            movements.push(m);
            idx += 1;
        }
    }
    if (movements.length === 0) {
        warnings.push('Nessun movimento riconosciuto: verifica intestazioni Fineco (Data contabile, Entrate/Uscite, Saldo).');
    }
    return finalize(movements, warnings);
}

export function parseFinecoCsv(buffer: Buffer): ParseBankStatementResult {
    const text = buffer.toString('utf-8');
    // Fineco spesso esporta con ; e BOM
    const cleaned = text.replace(/^\uFEFF/, '');
    const delimiter = cleaned.split('\n')[0]?.includes(';') ? ';' : ',';
    const parsed = Papa.parse<Record<string, unknown>>(cleaned, {
        header: true,
        skipEmptyLines: true,
        delimiter,
        dynamicTyping: false,
    });
    if (parsed.errors.length) {
        // Continua best-effort
    }
    return parseTabularRows(parsed.data || []);
}

export async function parseFinecoXlsx(buffer: Buffer): Promise<ParseBankStatementResult> {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) {
        return { movements: [], periodStart: null, periodEnd: null, closingBalanceCents: null, warnings: ['Workbook Excel vuoto'] };
    }
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    return parseTabularRows(rows);
}

/**
 * PDF Fineco: estrazione testo server-side (unpdf + polyfill DOMMatrix).
 * Limitazione: PDF scansionati (immagine) non producono testo utile.
 */
export async function parseFinecoPdf(buffer: Buffer): Promise<ParseBankStatementResult> {
    const warnings: string[] = [];
    let text = '';

    try {
        // Polyfill prima di caricare il parser PDF (Node/Vercel non ha DOM browser)
        const { ensurePdfDomPolyfills } = await import('./pdfDomPolyfill');
        ensurePdfDomPolyfills();

        const { extractText, getDocumentProxy } = await import('unpdf');
        const pdf = await getDocumentProxy(new Uint8Array(buffer));
        const extracted = await extractText(pdf, { mergePages: true });

        // Deduzione sicura: evita "Property 'join' does not exist on type 'never'" in build Vercel
        const rawText: unknown = (extracted as { text?: unknown })?.text;
        if (typeof rawText === 'string') {
            text = rawText;
        } else if (Array.isArray(rawText)) {
            text = (rawText as unknown[]).map((item) => String(item ?? '')).join('\n');
        } else if (rawText != null) {
            text = String(rawText);
        } else {
            text = '';
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[parseFinecoPdf]', msg);
        return {
            movements: [],
            periodStart: null,
            periodEnd: null,
            closingBalanceCents: null,
            warnings: [
                `Estrazione PDF non riuscita (${msg}). Esporta l'estratto da Fineco in CSV o Excel e ricaricalo.`,
            ],
        };
    }

    if (!text.trim()) {
        return {
            movements: [],
            periodStart: null,
            periodEnd: null,
            closingBalanceCents: null,
            warnings: ['PDF senza testo estraibile (possibile scansione). Esporta CSV/Excel da Fineco.'],
        };
    }

    // Prova a interpretare come CSV embedded
    if (text.includes(';') && /data/i.test(text)) {
        const asCsv = parseFinecoCsv(Buffer.from(text, 'utf-8'));
        if (asCsv.movements.length > 0) return asCsv;
    }

    const movements: ParsedBankMovement[] = [];
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const rowRe =
        /^(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\s+(?:(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\s+)?(.+?)\s+(-?\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|-?\d+[.,]\d{2})\s*(-?\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|-?\d+[.,]\d{2})?$/;

    let idx = 0;
    for (const line of lines) {
        const m = line.match(rowRe);
        if (!m) continue;
        const accountingDate = parseFinecoDate(m[1]);
        const valueDate = m[2] ? parseFinecoDate(m[2]) : accountingDate;
        const description = (m[3] || '').trim();
        const amount = parseItalianNumber(m[4]);
        const balance = m[5] ? parseItalianNumber(m[5]) : null;
        if (amount == null) continue;
        movements.push({
            lineIndex: idx++,
            valueDate,
            accountingDate,
            description: description || 'Movimento PDF',
            amountCents: eurosToCents(amount),
            debitCents: amount < 0 ? eurosToCents(Math.abs(amount)) : null,
            creditCents: amount > 0 ? eurosToCents(amount) : null,
            balanceCents: balance != null ? eurosToCents(balance) : null,
            raw: { line },
        });
    }

    if (movements.length === 0) {
        warnings.push('Testo PDF estratto ma nessuna riga movimento riconosciuta. Preferisci export CSV Fineco.');
    }
    return finalize(movements, warnings);
}

export async function parseBankStatementFile(
    buffer: Buffer,
    fileName: string,
    contentType?: string
): Promise<ParseBankStatementResult> {
    const lower = fileName.toLowerCase();
    const ct = (contentType || '').toLowerCase();

    if (lower.endsWith('.csv') || ct.includes('csv') || ct.includes('text/plain')) {
        return parseFinecoCsv(buffer);
    }
    if (
        lower.endsWith('.xlsx') ||
        lower.endsWith('.xls') ||
        ct.includes('spreadsheet') ||
        ct.includes('excel')
    ) {
        return parseFinecoXlsx(buffer);
    }
    if (lower.endsWith('.pdf') || ct.includes('pdf')) {
        return parseFinecoPdf(buffer);
    }
    return parseFinecoCsv(buffer);
}
