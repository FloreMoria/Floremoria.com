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
    // Fineco a volte usa segno trailing: 34,50-
    let negative = false;
    if (s.endsWith('-')) {
        negative = true;
        s = s.slice(0, -1);
    } else if (s.startsWith('+')) {
        s = s.slice(1);
    } else if (s.startsWith('-')) {
        negative = true;
        s = s.slice(1);
    } else if (s.startsWith('(') && s.endsWith(')')) {
        negative = true;
        s = s.slice(1, -1);
    }
    // 1.234,56 → 1234.56 ; 1234.56 resta
    if (s.includes(',') && s.includes('.')) {
        s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.includes(',')) {
        s = s.replace(',', '.');
    }
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return negative ? -Math.abs(n) : n;
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

function finalize(
    movements: ParsedBankMovement[],
    warnings: string[],
    textPreview?: string[]
): ParseBankStatementResult {
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
        ...(textPreview && textPreview.length ? { textPreview } : {}),
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

/** Token data Fineco: DD/MM/YYYY | DD.MM.YYYY | DD-MM-YYYY | YY a 2 cifre. */
const DATE_TOKEN = '(\\d{1,2}[./\\-]\\d{1,2}[./\\-]\\d{2,4})';
/** Importo IT: 1.250,00 | -34,50 | 34,50- | 1250,00 | 34.50 */
const AMOUNT_TOKEN =
    '([+-]?\\d{1,3}(?:[.\\s]\\d{3})*[.,]\\d{2}|[+-]?\\d+[.,]\\d{2}|\\d{1,3}(?:[.\\s]\\d{3})*[.,]\\d{2}-|\\d+[.,]\\d{2}-)';

const NOISE_LINE =
    /^(pagina\s+\d+|estratto\s+conto|lista\s+movimenti|finecobank|iban\s*:|saldo\s+(iniziale|contabile|disponibile)|tot\.?\s*(entrate|uscite)|data\s+contabile|data\s+valuta|descrizione|entrate|uscite|avere|dare)/i;

function isNoiseLine(line: string): boolean {
    const t = line.trim();
    if (!t || t.length < 3) return true;
    if (NOISE_LINE.test(t)) return true;
    if (/^[=_\-]{3,}$/.test(t)) return true;
    return false;
}

function looksLikeDateStart(line: string): boolean {
    return new RegExp(`^${DATE_TOKEN}`).test(line.trim());
}

function extractTrailingAmounts(line: string): { amounts: number[]; descriptionPart: string } {
    const amounts: number[] = [];
    let rest = line.trim();
    // Estrae fino a 3 importi dalla coda (movimento + saldo, o dare/avere + saldo)
    for (let i = 0; i < 3; i++) {
        const m = rest.match(new RegExp(`^(.*?)\\s+${AMOUNT_TOKEN}\\s*$`));
        if (!m) break;
        const val = parseItalianNumber(m[2]);
        if (val == null) break;
        amounts.unshift(val);
        rest = m[1].trim();
    }
    return { amounts, descriptionPart: rest };
}

function classifyFinecoAmounts(amounts: number[]): {
    amountEuros: number | null;
    debit: number | null;
    credit: number | null;
    balance: number | null;
} {
    if (amounts.length === 0) {
        return { amountEuros: null, debit: null, credit: null, balance: null };
    }
    if (amounts.length === 1) {
        const a = amounts[0];
        return {
            amountEuros: a,
            debit: a < 0 ? Math.abs(a) : null,
            credit: a > 0 ? a : null,
            balance: null,
        };
    }
    if (amounts.length === 2) {
        const [a, b] = amounts;
        // Colonne Entrate|Uscite (una a zero)
        if (Math.abs(a) < 0.005 && Math.abs(b) >= 0.005) {
            return {
                amountEuros: -Math.abs(b),
                debit: Math.abs(b),
                credit: null,
                balance: null,
            };
        }
        if (Math.abs(b) < 0.005 && Math.abs(a) >= 0.005) {
            return {
                amountEuros: Math.abs(a),
                debit: null,
                credit: Math.abs(a),
                balance: null,
            };
        }
        // Default Fineco: [importo firmato, saldo progressivo]
        return {
            amountEuros: a,
            debit: a < 0 ? Math.abs(a) : null,
            credit: a > 0 ? a : null,
            balance: b,
        };
    }
    // 3 importi Fineco tipici: Entrate | Uscite | Saldo
    const [entrate, uscite, saldo] = amounts;
    if (Math.abs(uscite) >= 0.005 && Math.abs(entrate) < 0.005) {
        return {
            amountEuros: -Math.abs(uscite),
            debit: Math.abs(uscite),
            credit: null,
            balance: saldo,
        };
    }
    if (Math.abs(entrate) >= 0.005 && Math.abs(uscite) < 0.005) {
        return {
            amountEuros: Math.abs(entrate),
            debit: null,
            credit: Math.abs(entrate),
            balance: saldo,
        };
    }
    const net = Math.abs(entrate) - Math.abs(uscite);
    return {
        amountEuros: net,
        debit: Math.abs(uscite) >= 0.005 ? Math.abs(uscite) : null,
        credit: Math.abs(entrate) >= 0.005 ? Math.abs(entrate) : null,
        balance: saldo,
    };
}

/**
 * Parser multiformato testo PDF Fineco (scalare ufficiale + lista movimenti home banking).
 */
export function extractMovementsFromPdfText(text: string): {
    movements: ParsedBankMovement[];
    warnings: string[];
    textPreview: string[];
} {
    const warnings: string[] = [];
    const rawLines = text
        .split(/\r?\n/)
        .map((l) => l.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim())
        .filter(Boolean);

    const textPreview = rawLines.slice(0, 10);

    // Unisce continuazioni: righe senza data all'inizio appendono alla precedente con data
    const logical: string[] = [];
    for (const line of rawLines) {
        if (isNoiseLine(line) && !looksLikeDateStart(line)) {
            continue;
        }
        if (looksLikeDateStart(line) || logical.length === 0) {
            logical.push(line);
        } else if (!looksLikeDateStart(line) && logical.length > 0) {
            // Continuazione descrizione multilinea (fino a prossima data)
            const last = logical[logical.length - 1];
            if (!isNoiseLine(line) || new RegExp(AMOUNT_TOKEN).test(line)) {
                logical[logical.length - 1] = `${last} ${line}`.replace(/\s+/g, ' ').trim();
            }
        }
    }

    const movements: ParsedBankMovement[] = [];
    let idx = 0;

    // Pattern A: data [data valuta] descrizione importo [importo...] [saldo]
    const patternA = new RegExp(
        `^${DATE_TOKEN}(?:\\s+${DATE_TOKEN})?\\s+(.+?)\\s+${AMOUNT_TOKEN}(?:\\s+${AMOUNT_TOKEN})?(?:\\s+${AMOUNT_TOKEN})?\\s*$`
    );
    // Pattern B: data descrizione ... importo in coda (fallback più lasco)
    const patternB = new RegExp(`^${DATE_TOKEN}(?:\\s+${DATE_TOKEN})?\\s+(.+)$`);

    for (const line of logical) {
        if (!looksLikeDateStart(line)) continue;

        let accountingDate: string | null = null;
        let valueDate: string | null = null;
        let description = '';
        let amountEuros: number | null = null;
        let debit: number | null = null;
        let credit: number | null = null;
        let balance: number | null = null;

        const mA = line.match(patternA);
        if (mA) {
            accountingDate = parseFinecoDate(mA[1]);
            valueDate = mA[2] ? parseFinecoDate(mA[2]) : accountingDate;
            description = (mA[3] || '').trim();
            const nums = [mA[4], mA[5], mA[6]]
                .filter(Boolean)
                .map((x) => parseItalianNumber(x))
                .filter((n): n is number => n != null);
            const classified = classifyFinecoAmounts(nums);
            amountEuros = classified.amountEuros;
            debit = classified.debit;
            credit = classified.credit;
            balance = classified.balance;
        } else {
            const mB = line.match(patternB);
            if (!mB) continue;
            accountingDate = parseFinecoDate(mB[1]);
            valueDate = mB[2] ? parseFinecoDate(mB[2]) : accountingDate;
            const { amounts, descriptionPart } = extractTrailingAmounts(mB[3] || '');
            if (amounts.length === 0) continue;
            description = descriptionPart
                .replace(new RegExp(`^${DATE_TOKEN}\\s*`), '')
                .trim();
            // Se descriptionPart inizia ancora con data valuta già consumata in mB[2]
            if (mB[2] && description.startsWith(mB[2])) {
                description = description.slice(mB[2].length).trim();
            }
            const classified = classifyFinecoAmounts(amounts);
            amountEuros = classified.amountEuros;
            debit = classified.debit;
            credit = classified.credit;
            balance = classified.balance;
        }

        if (amountEuros == null || amountEuros === 0) continue;
        if (!accountingDate && !valueDate) continue;

        // Pulisce residui di colonne "D/A" o header leak
        description = description
            .replace(/\b(DARE|AVERE|ENTRATE|USCITE)\b/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (!description) description = 'Movimento Fineco';

        movements.push({
            lineIndex: idx++,
            valueDate: valueDate || accountingDate,
            accountingDate: accountingDate || valueDate,
            description,
            amountCents: eurosToCents(amountEuros),
            debitCents: debit != null ? eurosToCents(debit) : amountEuros < 0 ? eurosToCents(Math.abs(amountEuros)) : null,
            creditCents: credit != null ? eurosToCents(credit) : amountEuros > 0 ? eurosToCents(amountEuros) : null,
            balanceCents: balance != null ? eurosToCents(balance) : null,
            raw: { line },
        });
    }

    if (movements.length === 0) {
        warnings.push(
            'Testo PDF estratto ma nessuna riga movimento riconosciuta. Preferisci export CSV Fineco. Vedi textPreview (prime 10 righe) per calibrazione.'
        );
    }

    return { movements, warnings, textPreview };
}

/**
 * PDF Fineco: 1) parser tabellare a coordinate (unpdf extractTextItems);
 * 2) fallback testo lineare; 3) CSV embedded.
 * Limitazione: PDF scansionati (immagine) non producono testo utile.
 */
export async function parseFinecoPdf(buffer: Buffer): Promise<ParseBankStatementResult> {
    let tabularAnomalies: import('./types').ParseBankStatementAnomaly[] = [];
    let tabularWarnings: string[] = [];
    let tabularPreview: string[] | undefined;

    // Path ufficiale: ricostruzione colonne da coordinate / blocchi
    try {
        const { parseFinecoPdfTabular } = await import('@/lib/financial/parseFinecoPdf');
        const tabular = await parseFinecoPdfTabular(buffer);
        tabularAnomalies = tabular.anomalies || [];
        tabularWarnings = tabular.warnings || [];
        tabularPreview = tabular.textPreview;
        if (tabular.movements.length > 0) {
            return {
                movements: tabular.movements,
                periodStart: tabular.periodStart,
                periodEnd: tabular.periodEnd,
                closingBalanceCents: tabular.closingBalanceCents,
                warnings: tabular.warnings,
                textPreview: tabular.textPreview,
                anomalies: tabular.anomalies,
            };
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[parseFinecoPdf] tabular path failed', msg);
        tabularAnomalies = [{ code: 'TABULAR_IMPORT_FAILED', message: msg }];
        tabularWarnings = [`Parser tabellare non disponibile (${msg}).`];
    }

    let text = '';

    try {
        const { ensurePdfDomPolyfills } = await import('./pdfDomPolyfill');
        ensurePdfDomPolyfills();

        const { extractText, getDocumentProxy } = await import('unpdf');
        const pdf = await getDocumentProxy(new Uint8Array(buffer));
        const extracted = await extractText(pdf, { mergePages: true });

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
                ...tabularWarnings,
                `Estrazione PDF non riuscita (${msg}). Esporta l'estratto da Fineco in CSV o Excel e ricaricalo.`,
            ],
            anomalies: tabularAnomalies,
            textPreview: tabularPreview,
        };
    }

    if (!text.trim()) {
        return {
            movements: [],
            periodStart: null,
            periodEnd: null,
            closingBalanceCents: null,
            warnings: [
                ...tabularWarnings,
                'PDF senza testo estraibile (possibile scansione). Esporta CSV/Excel da Fineco.',
            ],
            anomalies: tabularAnomalies,
            textPreview: tabularPreview,
        };
    }

    if (text.includes(';') && /data/i.test(text)) {
        const asCsv = parseFinecoCsv(Buffer.from(text, 'utf-8'));
        if (asCsv.movements.length > 0) {
            return {
                ...asCsv,
                warnings: [...tabularWarnings, ...asCsv.warnings],
                anomalies: tabularAnomalies,
            };
        }
    }

    const extracted = extractMovementsFromPdfText(text);
    const result = finalize(
        extracted.movements,
        [...tabularWarnings, ...extracted.warnings],
        extracted.textPreview
    );
    return {
        ...result,
        anomalies: [
            ...tabularAnomalies,
            ...(extracted.movements.length === 0
                ? [
                      {
                          code: 'LINEAR_FALLBACK_EMPTY',
                          message: 'Anche il fallback lineare non ha riconosciuto movimenti.',
                      },
                  ]
                : []),
        ],
        textPreview: result.textPreview || tabularPreview,
    };
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
