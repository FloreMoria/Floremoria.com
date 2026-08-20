/**
 * Convertitore tabellare PDF Estratto Conto FinecoBank.
 * Perché: il testo lineare di Fineco è scompaginato; le coordinate pdf.js
 * ricostruiscono colonne Data / Valuta / Causale / Dare-Avere / Saldo come un CSV virtuale.
 *
 * Assumption: PDF nativo (testuale), non scansione OCR-only.
 */

import type { BankTransaction } from '@/lib/financial/types';
import type { ParseBankStatementResult, ParsedBankMovement } from '@/lib/financial/bankStatements/types';

export type FinecoPdfAnomaly = {
    code: string;
    message: string;
    page?: number;
    lineIndex?: number;
    raw?: string;
};

export type FinecoVirtualRow = {
    accountingDate: string | null;
    valueDate: string | null;
    description: string;
    debitEuros: number | null;
    creditEuros: number | null;
    balanceEuros: number | null;
    amountEuros: number | null;
    page: number;
    y: number;
    rawCells: string[];
};

export type ParseFinecoPdfResult = ParseBankStatementResult & {
    anomalies: FinecoPdfAnomaly[];
    /** Record normalizzati equivalenti a un CSV strutturato Fineco. */
    transactions: BankTransaction[];
    /** Righe tabellari intermedie (debug / calibrazione). */
    virtualRows?: FinecoVirtualRow[];
};

type TextItem = {
    str: string;
    x: number;
    y: number;
    width: number;
    height: number;
};

type RowCluster = {
    y: number;
    page: number;
    items: TextItem[];
    text: string;
};

type ColumnLayout = {
    opDateX: number;
    valueDateX: number;
    descX: number;
    debitX: number;
    creditX: number;
    balanceX: number;
    pageWidth: number;
};

const DATE_RE = /^(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})$/;
const AMOUNT_RE =
    /^[+-]?\d{1,3}(?:[.\s]\d{3})*[.,]\d{2}-?$|^[+-]?\d+[.,]\d{2}-?$|^\(\d{1,3}(?:[.\s]\d{3})*[.,]\d{2}\)$/;
const Y_TOLERANCE = 3.2;
const HEADER_HINT =
    /(data\s*(contabile|operazione|valuta)|descrizione|causale|entrate|uscite|dare|avere|saldo)/i;
const TABLE_START_HINT =
    /(iban|coordinate\s+bancarie|lista\s+movimenti|movimenti\s+del\s+periodo|estratto\s+conto)/i;
const FEE_HINT =
    /(competenze\s+e\s+spese|ritenute\s+fiscali|spese\s+di\s+tenuta|commissioni|imposte\s+di\s+bollo|canone\s+annuale|spese\s+bancarie)/i;
const NOISE_ROW =
    /^(pagina\s+\d+|finecobank|www\.|cliente\s*:|intestatario|periodo\s+dal|tot\.?\s*(entrate|uscite)|saldo\s+(iniziale|contabile|disponibile)\s*$|operazione|valuta|contabile|descrizione|entrate|uscite|dare|avere|saldo)$/i;

/** Converte date Fineco DD.MM.YYYY / DD/MM/YYYY → ISO YYYY-MM-DD. */
export function parseFinecoDateToIso(raw: unknown): string | null {
    if (raw == null || raw === '') return null;
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
        return raw.toISOString().slice(0, 10);
    }
    const s = String(raw).trim();
    const it = s.match(DATE_RE);
    if (it) {
        const d = Number(it[1]);
        const m = Number(it[2]);
        let y = Number(it[3]);
        if (y < 100) y += 2000;
        if (m < 1 || m > 12 || d < 1 || d > 31) return null;
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    return null;
}

/** Importi IT: 1.250,50 → 1250.50 ; 34,00- / -34,00 → -34. */
export function parseItalianAmount(raw: unknown): number | null {
    if (raw == null || raw === '') return null;
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    let s = String(raw).trim();
    if (!s || s === '-' || s === '—' || s === '–') return null;
    s = s.replace(/\s/g, '').replace(/€/g, '').replace(/EUR/gi, '');
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
    if (s.includes(',') && s.includes('.')) {
        s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.includes(',')) {
        s = s.replace(',', '.');
    }
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return negative ? -Math.abs(n) : n;
}

function eurosToCents(euros: number): number {
    return Math.round(euros * 100);
}

function isDateToken(s: string): boolean {
    return DATE_RE.test(s.trim());
}

function isAmountToken(s: string): boolean {
    const t = s.trim();
    if (!t || t.length > 18) return false;
    return AMOUNT_RE.test(t);
}

function clusterRows(items: TextItem[], page: number): RowCluster[] {
    const sorted = [...items]
        .filter((it) => it.str.trim().length > 0)
        .sort((a, b) => b.y - a.y || a.x - b.x);

    const rows: RowCluster[] = [];
    for (const item of sorted) {
        const last = rows[rows.length - 1];
        if (last && Math.abs(last.y - item.y) <= Y_TOLERANCE) {
            last.items.push(item);
            last.y = (last.y * (last.items.length - 1) + item.y) / last.items.length;
        } else {
            rows.push({ y: item.y, page, items: [item], text: '' });
        }
    }

    for (const row of rows) {
        row.items.sort((a, b) => a.x - b.x);
        row.text = row.items
            .map((i) => i.str)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
    return rows;
}

function pageWidthFromItems(items: TextItem[]): number {
    let max = 0;
    for (const it of items) {
        max = Math.max(max, it.x + (it.width || 0));
    }
    return max > 0 ? max : 595;
}

/**
 * Layout colonne: da header se presente, altrimenti bande proporzionali Fineco A4.
 */
function inferColumnLayout(rows: RowCluster[], pageWidth: number): ColumnLayout {
    const fallback: ColumnLayout = {
        opDateX: pageWidth * 0.06,
        valueDateX: pageWidth * 0.16,
        descX: pageWidth * 0.28,
        debitX: pageWidth * 0.62,
        creditX: pageWidth * 0.74,
        balanceX: pageWidth * 0.88,
        pageWidth,
    };

    const header = rows.find((r) => {
        const t = r.text.toLowerCase();
        return (
            (t.includes('data') && (t.includes('valuta') || t.includes('operazione') || t.includes('contabile'))) ||
            (t.includes('descrizione') && (t.includes('entrate') || t.includes('uscite') || t.includes('saldo')))
        );
    });
    if (!header) return fallback;

    const layout = { ...fallback };
    for (const it of header.items) {
        const key = it.str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (/^data$/.test(key) || key.includes('contabile') || key.includes('operazione')) {
            if (layout.opDateX === fallback.opDateX || it.x < layout.opDateX) layout.opDateX = it.x;
        } else if (key.includes('valuta')) {
            layout.valueDateX = it.x;
        } else if (key.includes('descr') || key.includes('causale')) {
            layout.descX = it.x;
        } else if (key.includes('uscite') || key === 'dare') {
            layout.debitX = it.x;
        } else if (key.includes('entrate') || key === 'avere') {
            layout.creditX = it.x;
        } else if (key.includes('saldo')) {
            layout.balanceX = it.x;
        }
    }
    return layout;
}

function nearestColumn(x: number, layout: ColumnLayout): keyof Omit<ColumnLayout, 'pageWidth'> {
    const centers: Array<[keyof Omit<ColumnLayout, 'pageWidth'>, number]> = [
        ['opDateX', layout.opDateX],
        ['valueDateX', layout.valueDateX],
        ['descX', layout.descX],
        ['debitX', layout.debitX],
        ['creditX', layout.creditX],
        ['balanceX', layout.balanceX],
    ];
    let best = centers[0][0];
    let bestDist = Infinity;
    for (const [name, cx] of centers) {
        const d = Math.abs(x - cx);
        if (d < bestDist) {
            bestDist = d;
            best = name;
        }
    }
    // Descrizione occupa una fascia ampia: se x è tra valuta e dare → desc
    if (x > layout.valueDateX + 25 && x < layout.debitX - 20) return 'descX';
    return best;
}

type CellBag = {
    opDate: string[];
    valueDate: string[];
    description: string[];
    debit: string[];
    credit: string[];
    balance: string[];
};

function rowToCells(row: RowCluster, layout: ColumnLayout): CellBag {
    const cells: CellBag = {
        opDate: [],
        valueDate: [],
        description: [],
        debit: [],
        credit: [],
        balance: [],
    };
    for (const it of row.items) {
        const col = nearestColumn(it.x, layout);
        const t = it.str.trim();
        if (!t) continue;
        if (col === 'opDateX') cells.opDate.push(t);
        else if (col === 'valueDateX') cells.valueDate.push(t);
        else if (col === 'descX') cells.description.push(t);
        else if (col === 'debitX') cells.debit.push(t);
        else if (col === 'creditX') cells.credit.push(t);
        else if (col === 'balanceX') cells.balance.push(t);
    }
    return cells;
}

function findTableStartIndex(rows: RowCluster[]): number {
    let afterMeta = 0;
    for (let i = 0; i < rows.length; i++) {
        const t = rows[i].text;
        if (TABLE_START_HINT.test(t) || /IBAN\s*[A-Z0-9]/i.test(t)) {
            afterMeta = i + 1;
        }
        if (HEADER_HINT.test(t) && (t.toLowerCase().includes('data') || t.toLowerCase().includes('descrizione'))) {
            return Math.max(afterMeta, i + 1);
        }
    }
    // Fallback: prima riga che inizia con una data
    for (let i = afterMeta; i < rows.length; i++) {
        const first = rows[i].items[0]?.str?.trim() || '';
        if (isDateToken(first)) return i;
    }
    return afterMeta;
}

function joinCell(parts: string[]): string {
    return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function classifySignedAmount(
    debitRaw: string | null,
    creditRaw: string | null,
    trailingAmounts: number[]
): {
    debitEuros: number | null;
    creditEuros: number | null;
    balanceEuros: number | null;
    amountEuros: number | null;
} {
    const debit = debitRaw ? parseItalianAmount(debitRaw) : null;
    const credit = creditRaw ? parseItalianAmount(creditRaw) : null;

    if ((debit != null && Math.abs(debit) >= 0.005) || (credit != null && Math.abs(credit) >= 0.005)) {
        const d = debit != null && Math.abs(debit) >= 0.005 ? Math.abs(debit) : null;
        const c = credit != null && Math.abs(credit) >= 0.005 ? Math.abs(credit) : null;
        let amount: number | null = null;
        if (c != null && d == null) amount = c;
        else if (d != null && c == null) amount = -d;
        else if (c != null && d != null) amount = c - d;
        return {
            debitEuros: d,
            creditEuros: c,
            balanceEuros: trailingAmounts.length > 0 ? trailingAmounts[trailingAmounts.length - 1] : null,
            amountEuros: amount,
        };
    }

    if (trailingAmounts.length === 1) {
        const a = trailingAmounts[0];
        return {
            amountEuros: a,
            debitEuros: a < 0 ? Math.abs(a) : null,
            creditEuros: a > 0 ? a : null,
            balanceEuros: null,
        };
    }
    if (trailingAmounts.length === 2) {
        const [a, b] = trailingAmounts;
        return {
            amountEuros: a,
            debitEuros: a < 0 ? Math.abs(a) : null,
            creditEuros: a > 0 ? a : null,
            balanceEuros: b,
        };
    }
    if (trailingAmounts.length >= 3) {
        const [entrate, uscite, saldo] = trailingAmounts.slice(-3);
        if (Math.abs(uscite) >= 0.005 && Math.abs(entrate) < 0.005) {
            return {
                amountEuros: -Math.abs(uscite),
                debitEuros: Math.abs(uscite),
                creditEuros: null,
                balanceEuros: saldo,
            };
        }
        if (Math.abs(entrate) >= 0.005 && Math.abs(uscite) < 0.005) {
            return {
                amountEuros: Math.abs(entrate),
                debitEuros: null,
                creditEuros: Math.abs(entrate),
                balanceEuros: saldo,
            };
        }
        return {
            amountEuros: Math.abs(entrate) - Math.abs(uscite),
            debitEuros: Math.abs(uscite) >= 0.005 ? Math.abs(uscite) : null,
            creditEuros: Math.abs(entrate) >= 0.005 ? Math.abs(entrate) : null,
            balanceEuros: saldo,
        };
    }

    return { debitEuros: null, creditEuros: null, balanceEuros: null, amountEuros: null };
}

function extractTrailingAmountsFromText(text: string): number[] {
    const amounts: number[] = [];
    let rest = text.trim();
    for (let i = 0; i < 3; i++) {
        const m = rest.match(/^(.*?)(\s+)([+-]?\d{1,3}(?:[.\s]\d{3})*[.,]\d{2}-?|[+-]?\d+[.,]\d{2}-?|\(\d+[.,]\d{2}\))\s*$/);
        if (!m) break;
        const val = parseItalianAmount(m[3]);
        if (val == null) break;
        amounts.unshift(val);
        rest = m[1].trim();
    }
    return amounts;
}

function isHeaderOrNoise(text: string): boolean {
    if (!text || text.length < 2) return true;
    if (NOISE_ROW.test(text)) return true;
    // Seconda riga header Fineco tipo "Operazione Valuta" senza date/importi
    if (
        /^(data\s+)?(operazione|valuta|contabile)(\s+(data\s+)?(operazione|valuta|contabile))*$/i.test(
            text.trim()
        )
    ) {
        return true;
    }
    if (HEADER_HINT.test(text) && !DATE_RE.test(text.split(/\s+/)[0] || '')) {
        const hasDate = DATE_RE.test(text);
        if (!hasDate) return true;
    }
    return false;
}

/**
 * Converte item posizionali → record tabellari (CSV virtuale).
 */
export function convertPositionedItemsToVirtualRows(
    pages: TextItem[][],
    anomalies: FinecoPdfAnomaly[]
): FinecoVirtualRow[] {
    const virtualRows: FinecoVirtualRow[] = [];
    let open: FinecoVirtualRow | null = null;

    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
        const pageItems = pages[pageIdx] || [];
        const page = pageIdx + 1;
        const rows = clusterRows(pageItems, page);
        const width = pageWidthFromItems(pageItems);
        const layout = inferColumnLayout(rows, width);
        const start = findTableStartIndex(rows);

        for (let i = start; i < rows.length; i++) {
            const row = rows[i];
            if (isHeaderOrNoise(row.text) && !FEE_HINT.test(row.text)) {
                continue;
            }

            const cells = rowToCells(row, layout);
            const opDateStr = joinCell(cells.opDate);
            const valueDateStr = joinCell(cells.valueDate);
            let desc = joinCell(cells.description);
            const debitStr = joinCell(cells.debit);
            const creditStr = joinCell(cells.credit);
            const balanceStr = joinCell(cells.balance);

            // Fallback: se le colonne date sono vuote ma la riga inizia con date nel testo
            let accountingDate = parseFinecoDateToIso(opDateStr.split(/\s+/)[0] || '');
            let valueDate = parseFinecoDateToIso(valueDateStr.split(/\s+/)[0] || '');

            if (!accountingDate) {
                const tokens = row.text.split(/\s+/);
                if (tokens[0] && isDateToken(tokens[0])) {
                    accountingDate = parseFinecoDateToIso(tokens[0]);
                    if (tokens[1] && isDateToken(tokens[1])) {
                        valueDate = parseFinecoDateToIso(tokens[1]);
                    }
                    if (!desc) {
                        desc = tokens
                            .slice(valueDate && tokens[1] && isDateToken(tokens[1]) ? 2 : 1)
                            .join(' ');
                    }
                }
            }
            if (!valueDate) valueDate = accountingDate;

            const amountsFromCols = [
                ...cells.debit.filter(isAmountToken),
                ...cells.credit.filter(isAmountToken),
                ...cells.balance.filter(isAmountToken),
            ]
                .map((a) => parseItalianAmount(a))
                .filter((n): n is number => n != null);

            const classified = classifySignedAmount(
                debitStr && isAmountToken(debitStr) ? debitStr : null,
                creditStr && isAmountToken(creditStr) ? creditStr : null,
                amountsFromCols.length
                    ? amountsFromCols
                    : extractTrailingAmountsFromText(row.text)
            );

            // Nuova riga movimento: data operazione presente
            if (accountingDate) {
                if (open && open.amountEuros != null && Math.abs(open.amountEuros) >= 0.005) {
                    virtualRows.push(open);
                } else if (open && FEE_HINT.test(open.description)) {
                    // Onere bancario senza importo chiaro: tieni con warning
                    anomalies.push({
                        code: 'FEE_WITHOUT_AMOUNT',
                        message: `Voce onere senza importo netto affidabile: ${open.description.slice(0, 80)}`,
                        page: open.page,
                        raw: open.rawCells.join(' | '),
                    });
                    if (open.amountEuros != null) virtualRows.push(open);
                } else if (open) {
                    anomalies.push({
                        code: 'ROW_SKIPPED_NO_AMOUNT',
                        message: `Riga con data ma senza importo: ${open.description.slice(0, 80) || '(vuota)'}`,
                        page: open.page,
                        raw: open.rawCells.join(' | '),
                    });
                }

                // Pulisci descrizione da date residue / header leak
                desc = desc
                    .replace(new RegExp(DATE_RE.source, 'g'), ' ')
                    .replace(/\b(DARE|AVERE|ENTRATE|USCITE|SALDO)\b/gi, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();

                open = {
                    accountingDate,
                    valueDate,
                    description: desc || (FEE_HINT.test(row.text) ? row.text : 'Movimento Fineco'),
                    debitEuros: classified.debitEuros,
                    creditEuros: classified.creditEuros,
                    balanceEuros: classified.balanceEuros ?? (balanceStr ? parseItalianAmount(balanceStr) : null),
                    amountEuros: classified.amountEuros,
                    page,
                    y: row.y,
                    rawCells: [opDateStr, valueDateStr, desc, debitStr, creditStr, balanceStr],
                };
                continue;
            }

            // Continuazione multilinea descrizione (fino a nuova data)
            if (open) {
                const cont = desc || row.text;
                if (cont && !isHeaderOrNoise(cont)) {
                    open.description = `${open.description} ${cont}`.replace(/\s+/g, ' ').trim();
                }
                // Importi a volte solo sull'ultima riga del blocco
                if (open.amountEuros == null && classified.amountEuros != null) {
                    open.amountEuros = classified.amountEuros;
                    open.debitEuros = classified.debitEuros;
                    open.creditEuros = classified.creditEuros;
                    open.balanceEuros = classified.balanceEuros ?? open.balanceEuros;
                } else if (classified.balanceEuros != null && open.balanceEuros == null) {
                    open.balanceEuros = classified.balanceEuros;
                }
                continue;
            }

            // Onere / riepilogo fiscale isolato (senza data colonna ma con importo)
            if (FEE_HINT.test(row.text) && classified.amountEuros != null) {
                virtualRows.push({
                    accountingDate: null,
                    valueDate: null,
                    description: row.text.replace(/\s+/g, ' ').trim(),
                    debitEuros: classified.debitEuros,
                    creditEuros: classified.creditEuros,
                    balanceEuros: classified.balanceEuros,
                    amountEuros: classified.amountEuros,
                    page,
                    y: row.y,
                    rawCells: [row.text],
                });
                continue;
            }

            if (row.text.length > 8 && !isHeaderOrNoise(row.text)) {
                anomalies.push({
                    code: 'UNPARSED_ROW',
                    message: `Riga non classificata (pag. ${page}): ${row.text.slice(0, 100)}`,
                    page,
                    raw: row.text,
                });
            }
        }
    }

    if (open) {
        if (open.amountEuros != null && Math.abs(open.amountEuros) >= 0.005) {
            virtualRows.push(open);
        } else {
            anomalies.push({
                code: 'TRAILING_ROW_NO_AMOUNT',
                message: `Ultima riga aperta senza importo: ${open.description.slice(0, 80)}`,
                page: open.page,
                raw: open.rawCells.join(' | '),
            });
        }
    }

    return virtualRows;
}

export function virtualRowsToMovements(rows: FinecoVirtualRow[]): ParsedBankMovement[] {
    const movements: ParsedBankMovement[] = [];
    let idx = 0;
    for (const r of rows) {
        if (r.amountEuros == null || Math.abs(r.amountEuros) < 0.005) continue;
        movements.push({
            lineIndex: idx++,
            valueDate: r.valueDate || r.accountingDate,
            accountingDate: r.accountingDate || r.valueDate,
            description: r.description || 'Movimento Fineco',
            amountCents: eurosToCents(r.amountEuros),
            debitCents:
                r.debitEuros != null
                    ? eurosToCents(Math.abs(r.debitEuros))
                    : r.amountEuros < 0
                      ? eurosToCents(Math.abs(r.amountEuros))
                      : null,
            creditCents:
                r.creditEuros != null
                    ? eurosToCents(Math.abs(r.creditEuros))
                    : r.amountEuros > 0
                      ? eurosToCents(r.amountEuros)
                      : null,
            balanceCents: r.balanceEuros != null ? eurosToCents(r.balanceEuros) : null,
            raw: {
                page: r.page,
                cells: r.rawCells,
                parser: 'fineco-pdf-tabular',
            },
        });
    }
    return movements;
}

/** Array BankTransaction[] equivalente a un CSV Fineco strutturato. */
export function movementsToBankTransactions(movements: ParsedBankMovement[]): BankTransaction[] {
    return movements.map((m, i) => {
        const emittedAt = `${(m.accountingDate || m.valueDate || '1970-01-01').slice(0, 10)}T12:00:00.000Z`;
        const desc = m.description || 'Movimento Fineco';
        return {
            id: `fineco-pdf-${i}-${emittedAt.slice(0, 10)}-${m.amountCents}`,
            amountCents: m.amountCents,
            currency: 'EUR',
            side: 'iban',
            status: 'completed',
            reference: null,
            counterpartyName: desc.slice(0, 180),
            counterpartyIban: null,
            emittedAt,
            category: FEE_HINT.test(desc) ? 'BANK_FEE' : null,
            rawData: m.raw ?? { description: desc },
        };
    });
}

function finalizeResult(
    movements: ParsedBankMovement[],
    warnings: string[],
    anomalies: FinecoPdfAnomaly[],
    textPreview: string[],
    virtualRows?: FinecoVirtualRow[]
): ParseFinecoPdfResult {
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
        textPreview: textPreview.length ? textPreview : undefined,
        anomalies,
        transactions: movementsToBankTransactions(movements),
        virtualRows,
    };
}

/**
 * Estrae testo posizionato (unpdf extractTextItems) e costruisce movimenti tabellari.
 * Non blocca su anomalie: le riporta in `anomalies` / `warnings`.
 */
export async function parseFinecoPdfTabular(buffer: Buffer): Promise<ParseFinecoPdfResult> {
    const anomalies: FinecoPdfAnomaly[] = [];
    const warnings: string[] = [];

    try {
        const { ensurePdfDomPolyfills } = await import('@/lib/financial/bankStatements/pdfDomPolyfill');
        ensurePdfDomPolyfills();

        const { extractTextItems, getDocumentProxy } = await import('unpdf');
        const pdf = await getDocumentProxy(new Uint8Array(buffer));
        const { items: pageItems, totalPages } = await extractTextItems(pdf);

        if (!pageItems?.length) {
            warnings.push('PDF senza item di testo posizionati (possibile scansione).');
            return finalizeResult([], warnings, anomalies, []);
        }

        const pages: TextItem[][] = pageItems.map((page) =>
            (page || []).map((it) => ({
                str: String(it.str ?? ''),
                x: Number(it.x) || 0,
                y: Number(it.y) || 0,
                width: Number(it.width) || 0,
                height: Number(it.height) || 0,
            }))
        );

        const textPreview = pages
            .flatMap((p, pi) =>
                clusterRows(p, pi + 1)
                    .slice(0, 4)
                    .map((r) => r.text)
            )
            .slice(0, 12);

        const virtualRows = convertPositionedItemsToVirtualRows(pages, anomalies);
        const movements = virtualRowsToMovements(virtualRows);

        if (movements.length === 0) {
            warnings.push(
                `Parser tabellare: 0 movimenti su ${totalPages} pagine. Vedi anomalies/textPreview; preferisci CSV Fineco se persiste.`
            );
        } else if (anomalies.length > 0) {
            warnings.push(
                `Parser tabellare: ${movements.length} movimenti, ${anomalies.length} anomalie non bloccanti.`
            );
        }

        return finalizeResult(movements, warnings, anomalies, textPreview, virtualRows);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[parseFinecoPdfTabular]', msg);
        anomalies.push({ code: 'EXTRACT_FAILED', message: msg });
        warnings.push(`Estrazione PDF tabellare fallita (${msg}).`);
        return finalizeResult([], warnings, anomalies, []);
    }
}
