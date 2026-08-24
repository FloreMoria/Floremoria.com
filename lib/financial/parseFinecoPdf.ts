/**
 * Convertitore tabellare PDF Estratto Conto FinecoBank (layout scalare ufficiale).
 * Perché: il testo lineare è scompaginato; le coordinate pdf.js ricostruiscono
 * Data Operazione | Data Valuta | Uscite | Entrate | Descrizione Operazione.
 *
 * Assumption: PDF nativo Fineco «Estratto conto» (non sola scansione OCR).
 */

import type { BankTransaction } from '@/lib/financial/types';
import type {
    ParseBankStatementAnomaly,
    ParseBankStatementResult,
    ParsedBankMovement,
} from '@/lib/financial/bankStatements/types';

export type FinecoPdfAnomaly = ParseBankStatementAnomaly & {
    severity: 'info' | 'warn' | 'error';
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
    /** Note a margine / footer esclusi in silenzio (non sono errori). */
    ignoredMarginNotes: number;
    transactions: BankTransaction[];
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
    debitX: number;
    creditX: number;
    descX: number;
    balanceX: number;
    pageWidth: number;
};

const DATE_RE = /^(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})$/;
const AMOUNT_RE =
    /^[+-]?\d{1,3}(?:[.\s]\d{3})*[.,]\d{2}-?$|^[+-]?\d+[.,]\d{2}-?$|^\(\d{1,3}(?:[.\s]\d{3})*[.,]\d{2}\)$/;
const TIME_START_RE = /^\d{1,2}:\d{2}(:\d{2})?\b/;
const Y_TOLERANCE = 3.2;

/** Layout tipico Fineco «Estratto conto» A4 (da header DATA/USCITE/ENTRATE/DESCRIZIONE). */
const FINECO_SCALAR_LAYOUT: ColumnLayout = {
    opDateX: 40,
    valueDateX: 85,
    debitX: 155,
    creditX: 215,
    descX: 251,
    balanceX: 900,
    pageWidth: 595,
};

const HEADER_HINT =
    /(data\s*(operazione|valuta)|uscite|entrate|descrizione\s+operazione)/i;

/**
 * Footer / servizio / trasparenza: esclusi in silenzio (contati come note a margine).
 */
const SERVICE_MARGIN_RE =
    /^(pagina(\s+\d+(\s+di\s+\d+)?)?|estratto\s+conto|segue\s+a\s+pagina|finecobank|www\.|cliente\s+al\s+dettaglio|trovi\s+tutti\s+i\s+dettagli|classificazione\s+intestatari|coordinate\s+bancarie|conto\s+corrente\s+in\s+euro|conto\s+deposito|deposito\s+titoli|cashpark|trasparenza|tasso\s+(creditore|debitore)|tan\b|taeg\b|foglio\s+informativo|saldo\s+(iniziale|finale)(\s+in\s+euro)?|differenza\s+euro|valuta\s*$|data\s+documento|delegati|numero\s+conto|bic\s+(sepa|swift)|intestatario|periodo\s+dal|tot\.?\s*(entrate|uscite)|operazion[ei]|valuta|contabile|descrizione(\s+operazione)?|entrate|uscite|dare|avere|saldo|pec\s*:|capitale\s+sociale|albo\s+d(elle|ei)\s+banch|aderente\s+al\s+fondo|gruppo\s+bancario\s+fineco|interamente\s+sottoscritto|codice\s+fiscale|contrattuali\s+che\s+regolano|sede\s+legale|direzione\s+generale)/i;

function isServiceMarginRow(text: string): boolean {
    const t = text.trim();
    if (!t) return true;
    if (SERVICE_MARGIN_RE.test(t)) return true;
    if (/^pagina\s+\d+/i.test(t)) return true;
    if (/^segue\s+a\s+pagina/i.test(t)) return true;
    if (/finecobank\s+s\.?p\.?a/i.test(t)) return true;
    if (/saldo\s+iniziale/i.test(t) && !FEE_HINT.test(t)) return true;
    if (/^\+?\d{1,3}([.\s]\d{3})*[.,]\d{2}\s+saldo/i.test(t)) return true;
    if (/^estratto\s+conto\b/i.test(t) && !FEE_HINT.test(t)) return true;
    // Seconda riga header «OPERAZIONE / VALUTA»
    if (
        /^(data\s+)?(operazione|valuta|contabile)(\s+(data\s+)?(operazione|valuta|contabile))*$/i.test(
            t
        )
    ) {
        return true;
    }
    return false;
}

const FEE_HINT =
    /(imposta\s+di\s+bollo|imposte\s+di\s+bollo|canone\s+mensile|canone\s+annuale|spese\s+(di\s+)?tenuta(\s+conto)?|competenze(\s+e\s+spese)?|ritenute\s+fiscali|commissioni|spese\s+bancarie|oneri\s+bancari)/i;

const CONTINUATION_HINT =
    /^(mand\b|trn\b|transid\b|internet\b|canale\b|causale\b|info-cli\b|iban\b|ben:\b|ord:\b|beneficiario\b|inserimento\b|\(europe\)|dt-ord\b|banca\s+ord\b|data\s+inserimento\b)/i;

/** Converte date Fineco DD.MM.YYYY / DD/MM/YY → ISO YYYY-MM-DD. */
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

/**
 * Estrae saldo iniziale/finale dalle intestazioni Fineco «+32.120,48 Saldo iniziale in euro».
 * Perché: quelle righe sono note a margine (non movimenti) ma servono alla quadratura cassa.
 */
export function extractFinecoHeaderBalances(pageTexts: string[]): {
    openingBalanceCents: number | null;
    closingBalanceCents: number | null;
} {
    let openingBalanceCents: number | null = null;
    let closingBalanceCents: number | null = null;
    const openingRe =
        /([+-]?\d{1,3}(?:[.\s]\d{3})*,\d{2})\s*Saldo\s+iniziale\s+in\s+euro/i;
    const closingRe =
        /([+-]?\d{1,3}(?:[.\s]\d{3})*,\d{2})\s*Saldo\s+finale\s+in\s+euro/i;

    for (const text of pageTexts) {
        if (openingBalanceCents == null) {
            const m = text.match(openingRe);
            if (m) {
                const euros = parseItalianAmount(m[1]);
                if (euros != null) openingBalanceCents = eurosToCents(euros);
            }
        }
        if (closingBalanceCents == null) {
            const m = text.match(closingRe);
            if (m) {
                const euros = parseItalianAmount(m[1]);
                if (euros != null) closingBalanceCents = eurosToCents(euros);
            }
        }
    }
    return { openingBalanceCents, closingBalanceCents };
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

function inferColumnLayout(rows: RowCluster[], pageWidth: number): ColumnLayout {
    const layout: ColumnLayout = {
        ...FINECO_SCALAR_LAYOUT,
        pageWidth: pageWidth || FINECO_SCALAR_LAYOUT.pageWidth,
    };

    const header = rows.find((r) => {
        const t = r.text.toLowerCase();
        return (
            t.includes('uscite') &&
            t.includes('entrate') &&
            (t.includes('descrizione') || t.includes('data'))
        );
    });
    if (!header) return layout;

    for (const it of header.items) {
        const key = it.str
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
        if (key === 'data' || key.includes('operazione')) {
            if (it.x < 70) layout.opDateX = it.x;
        } else if (key.includes('valuta')) {
            layout.valueDateX = it.x;
        } else if (key.includes('uscite') || key === 'dare') {
            layout.debitX = it.x;
        } else if (key.includes('entrate') || key === 'avere') {
            layout.creditX = it.x;
        } else if (key.includes('descr')) {
            layout.descX = it.x;
        } else if (key.includes('saldo')) {
            layout.balanceX = it.x;
        }
    }
    return layout;
}

/**
 * Assegna colonna Fineco: a sinistra date, poi USCITE/ENTRATE, a destra descrizione.
 * Non forzare mai la fascia centrale come descrizione (lì stanno gli importi).
 */
function nearestColumn(x: number, layout: ColumnLayout): keyof Omit<ColumnLayout, 'pageWidth'> {
    if (x >= layout.descX - 15) return 'descX';
    if (x >= (layout.creditX + layout.descX) / 2) return 'descX';

    const centers: Array<[keyof Omit<ColumnLayout, 'pageWidth'>, number]> = [
        ['opDateX', layout.opDateX],
        ['valueDateX', layout.valueDateX],
        ['debitX', layout.debitX],
        ['creditX', layout.creditX],
        ['balanceX', layout.balanceX],
    ];
    let best: keyof Omit<ColumnLayout, 'pageWidth'> = 'debitX';
    let bestDist = Infinity;
    for (const [name, cx] of centers) {
        const d = Math.abs(x - cx);
        if (d < bestDist) {
            bestDist = d;
            best = name;
        }
    }
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
    for (let i = 0; i < rows.length; i++) {
        const t = rows[i].text;
        if (
            HEADER_HINT.test(t) &&
            /uscite/i.test(t) &&
            /entrate/i.test(t)
        ) {
            return i + 1;
        }
    }
    for (let i = 0; i < rows.length; i++) {
        const first = rows[i].items[0];
        if (first && first.x < 70 && isDateToken(first.str)) return i;
    }
    return 0;
}

function joinCell(parts: string[]): string {
    return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function isContinuationRow(text: string, cells: CellBag, hasLeftDate: boolean): boolean {
    if (hasLeftDate) return false;
    const t = text.trim();
    if (TIME_START_RE.test(t)) return true;
    if (CONTINUATION_HINT.test(t)) return true;
    if (/canale:\s*phone\/voice/i.test(t)) return true;
    // Solo descrizione a destra, senza date a sinistra né importi in uscite/entrate
    const debit = joinCell(cells.debit);
    const credit = joinCell(cells.credit);
    const hasAmountCol =
        (debit && isAmountToken(debit.split(/\s+/)[0] || '')) ||
        (credit && isAmountToken(credit.split(/\s+/)[0] || ''));
    if (!hasAmountCol && joinCell(cells.description).length > 0) return true;
    return false;
}

function inferFeeSign(description: string, amountAbs: number): number {
    // Oneri bancari → sempre uscita (negativo)
    if (FEE_HINT.test(description)) return -Math.abs(amountAbs);
    if (/addebito|sdd|bonifico\s+a\s+vs|fattura\s+a\s+vs/i.test(description)) {
        return -Math.abs(amountAbs);
    }
    if (/\bord\s*:/i.test(description) && /\bben\s*:/i.test(description)) {
        // Accredito da Ord: … Ben: Floremoria
        return Math.abs(amountAbs);
    }
    return -Math.abs(amountAbs); // default prudente: uscita se ambigua in colonna unica
}

function classifySignedAmount(
    debitRaw: string | null,
    creditRaw: string | null,
    description: string
): {
    debitEuros: number | null;
    creditEuros: number | null;
    balanceEuros: number | null;
    amountEuros: number | null;
} {
    const debit = debitRaw ? parseItalianAmount(debitRaw) : null;
    const credit = creditRaw ? parseItalianAmount(creditRaw) : null;

    if (debit != null && Math.abs(debit) >= 0.005 && (credit == null || Math.abs(credit) < 0.005)) {
        return {
            debitEuros: Math.abs(debit),
            creditEuros: null,
            balanceEuros: null,
            amountEuros: -Math.abs(debit),
        };
    }
    if (credit != null && Math.abs(credit) >= 0.005 && (debit == null || Math.abs(debit) < 0.005)) {
        return {
            debitEuros: null,
            creditEuros: Math.abs(credit),
            balanceEuros: null,
            amountEuros: Math.abs(credit),
        };
    }
    if (debit != null && credit != null && Math.abs(debit) >= 0.005 && Math.abs(credit) >= 0.005) {
        return {
            debitEuros: Math.abs(debit),
            creditEuros: Math.abs(credit),
            balanceEuros: null,
            amountEuros: Math.abs(credit) - Math.abs(debit),
        };
    }

    // Importo finito nella descrizione (layout mal allineato) → recupera
    const descTok = description.trim().split(/\s+/)[0] || '';
    if (isAmountToken(descTok)) {
        const a = parseItalianAmount(descTok);
        if (a != null && Math.abs(a) >= 0.005) {
            const signed = inferFeeSign(description, Math.abs(a));
            return {
                amountEuros: signed,
                debitEuros: signed < 0 ? Math.abs(signed) : null,
                creditEuros: signed > 0 ? Math.abs(signed) : null,
                balanceEuros: null,
            };
        }
    }

    return { debitEuros: null, creditEuros: null, balanceEuros: null, amountEuros: null };
}

function leftDateFromRow(row: RowCluster, layout: ColumnLayout, cells: CellBag): {
    accountingDate: string | null;
    valueDate: string | null;
} {
    // Solo date nella fascia sinistra (colonne DATA OPERAZIONE / VALUTA)
    const leftItems = row.items.filter((it) => it.x < layout.debitX - 20);
    const leftDates = leftItems.map((it) => it.str.trim()).filter(isDateToken);
    let accountingDate =
        parseFinecoDateToIso(joinCell(cells.opDate).split(/\s+/)[0] || '') ||
        (leftDates[0] ? parseFinecoDateToIso(leftDates[0]) : null);
    let valueDate =
        parseFinecoDateToIso(joinCell(cells.valueDate).split(/\s+/)[0] || '') ||
        (leftDates[1] ? parseFinecoDateToIso(leftDates[1]) : accountingDate);

    // Non usare date nella descrizione (es. «Ins: 07/04/2026 09:04:17»)
    return { accountingDate, valueDate: valueDate || accountingDate };
}

function pushAnomaly(
    anomalies: FinecoPdfAnomaly[],
    a: FinecoPdfAnomaly
) {
    anomalies.push(a);
}

/**
 * Converte item posizionali → record tabellari (CSV virtuale Fineco).
 */
export function convertPositionedItemsToVirtualRows(
    pages: TextItem[][],
    anomalies: FinecoPdfAnomaly[],
    counters?: { ignoredMarginNotes: number }
): FinecoVirtualRow[] {
    const virtualRows: FinecoVirtualRow[] = [];
    let open: FinecoVirtualRow | null = null;
    let ignored = 0;
    // Layout globale: preferisci quello della prima pagina con header USCITE/ENTRATE
    let globalLayout: ColumnLayout | null = null;

    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
        const pageItems = pages[pageIdx] || [];
        const page = pageIdx + 1;
        const rows = clusterRows(pageItems, page);
        const width = pageWidthFromItems(pageItems);
        const layout = inferColumnLayout(rows, width);
        if (
            rows.some((r) => /uscite/i.test(r.text) && /entrate/i.test(r.text)) ||
            !globalLayout
        ) {
            globalLayout = layout;
        }
        const activeLayout = globalLayout || layout;
        const start = findTableStartIndex(rows);

        for (let i = start; i < rows.length; i++) {
            const row = rows[i];

            if (isServiceMarginRow(row.text) && !FEE_HINT.test(row.text)) {
                ignored += 1;
                continue;
            }

            const cells = rowToCells(row, activeLayout);
            let desc = joinCell(cells.description);
            let debitStr = joinCell(cells.debit);
            let creditStr = joinCell(cells.credit);

            // Recupero: importo in colonna descrizione + testo lungo in entrate/uscite
            if (desc && isAmountToken(desc.split(/\s+/)[0] || '') && !isAmountToken(debitStr) && !isAmountToken(creditStr)) {
                const longText = [debitStr, creditStr].filter((s) => s && !isAmountToken(s)).join(' ').trim();
                if (longText.length > 8) {
                    const amountTok = desc.split(/\s+/)[0];
                    // Heuristica Fineco: x≈160 uscite, x≈220 entrate — se amount era in desc, prova debit
                    if (!debitStr || !isAmountToken(debitStr)) debitStr = amountTok;
                    desc = [desc.split(/\s+/).slice(1).join(' '), longText].filter(Boolean).join(' ').trim();
                    creditStr = '';
                }
            }

            const { accountingDate, valueDate } = leftDateFromRow(row, activeLayout, cells);
            const hasLeftDate = Boolean(accountingDate);

            if (isContinuationRow(row.text, cells, hasLeftDate) && open) {
                const cont = desc || row.text;
                if (cont && !isServiceMarginRow(cont)) {
                    open.description = `${open.description} ${cont}`.replace(/\s+/g, ' ').trim();
                }
                const classifiedCont = classifySignedAmount(
                    debitStr && isAmountToken(debitStr.split(/\s+/)[0] || '') ? debitStr.split(/\s+/)[0] : null,
                    creditStr && isAmountToken(creditStr.split(/\s+/)[0] || '') ? creditStr.split(/\s+/)[0] : null,
                    open.description
                );
                if (open.amountEuros == null && classifiedCont.amountEuros != null) {
                    open.amountEuros = classifiedCont.amountEuros;
                    open.debitEuros = classifiedCont.debitEuros;
                    open.creditEuros = classifiedCont.creditEuros;
                }
                continue;
            }

            const debitTok = debitStr.split(/\s+/).find(isAmountToken) || null;
            const creditTok = creditStr.split(/\s+/).find(isAmountToken) || null;
            const classified = classifySignedAmount(debitTok, creditTok, desc || row.text);

            // Nuova riga movimento solo con data a sinistra
            if (hasLeftDate && accountingDate) {
                if (open && open.amountEuros != null && Math.abs(open.amountEuros) >= 0.005) {
                    virtualRows.push(open);
                } else if (open && FEE_HINT.test(open.description)) {
                    // Ultimo tentativo: importo nella descrizione onere
                    const recovered = classifySignedAmount(null, null, open.description);
                    if (recovered.amountEuros != null) {
                        open.amountEuros = recovered.amountEuros;
                        open.debitEuros = recovered.debitEuros;
                        open.creditEuros = recovered.creditEuros;
                        virtualRows.push(open);
                    } else {
                        pushAnomaly(anomalies, {
                            code: 'FEE_WITHOUT_AMOUNT',
                            severity: 'warn',
                            message: `Voce onere senza importo affidabile: ${open.description.slice(0, 80)}`,
                            page: open.page,
                            raw: open.rawCells.join(' | '),
                        });
                    }
                } else if (open) {
                    // Continuazione senza importo: spesso frammento descrittivo già fuso — tratta come info
                    if (
                        TIME_START_RE.test(open.description) ||
                        CONTINUATION_HINT.test(open.description) ||
                        /canale:/i.test(open.description)
                    ) {
                        ignored += 1;
                    } else {
                        pushAnomaly(anomalies, {
                            code: 'ROW_PARTIAL_NO_AMOUNT',
                            severity: 'warn',
                            message: `Movimento con data ma senza importo: ${open.description.slice(0, 80) || '(vuota)'}`,
                            page: open.page,
                            raw: open.rawCells.join(' | '),
                        });
                    }
                }

                let cleanDesc = desc
                    .replace(/\b(DARE|AVERE|ENTRATE|USCITE|SALDO)\b/gi, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                // Rimuovi importo già classificato se ripetuto in testa alla descrizione
                if (cleanDesc && isAmountToken(cleanDesc.split(/\s+/)[0] || '')) {
                    cleanDesc = cleanDesc.split(/\s+/).slice(1).join(' ').trim();
                }

                // Se descrizione vuota ma credit/debit hanno testo non-importo
                if (!cleanDesc) {
                    const fromCols = [creditStr, debitStr]
                        .filter((s) => s && !isAmountToken(s.split(/\s+/)[0] || ''))
                        .join(' ')
                        .trim();
                    cleanDesc = fromCols;
                }

                if (!cleanDesc && FEE_HINT.test(row.text)) cleanDesc = row.text;
                if (!cleanDesc) cleanDesc = 'Movimento Fineco';

                let amountEuros = classified.amountEuros;
                let debitEuros = classified.debitEuros;
                let creditEuros = classified.creditEuros;

                // Oneri: forza segno negativo se c'è un importo in uscite o recuperato
                if (FEE_HINT.test(cleanDesc) && amountEuros != null && amountEuros > 0 && debitEuros == null) {
                    amountEuros = -Math.abs(amountEuros);
                    debitEuros = Math.abs(amountEuros);
                    creditEuros = null;
                }

                open = {
                    accountingDate,
                    valueDate: valueDate || accountingDate,
                    description: cleanDesc,
                    debitEuros,
                    creditEuros,
                    balanceEuros: null,
                    amountEuros,
                    page,
                    y: row.y,
                    rawCells: [
                        joinCell(cells.opDate),
                        joinCell(cells.valueDate),
                        cleanDesc,
                        debitStr,
                        creditStr,
                        '',
                    ],
                };
                continue;
            }

            // Onere isolato (senza data colonna) ma con importo
            if (FEE_HINT.test(row.text) && classified.amountEuros != null) {
                const signed =
                    classified.amountEuros > 0
                        ? -Math.abs(classified.amountEuros)
                        : classified.amountEuros;
                virtualRows.push({
                    accountingDate: null,
                    valueDate: null,
                    description: row.text.replace(/\s+/g, ' ').trim(),
                    debitEuros: Math.abs(signed),
                    creditEuros: null,
                    balanceEuros: null,
                    amountEuros: signed,
                    page,
                    y: row.y,
                    rawCells: [row.text],
                });
                continue;
            }

            // Riga non classificata → nota a margine silenziosa (mai allarme)
            if (row.text.length > 8) {
                if (open && (CONTINUATION_HINT.test(row.text) || TIME_START_RE.test(row.text))) {
                    open.description = `${open.description} ${row.text}`.replace(/\s+/g, ' ').trim();
                } else {
                    ignored += 1;
                }
            }
        }
    }

    if (open) {
        if (open.amountEuros != null && Math.abs(open.amountEuros) >= 0.005) {
            virtualRows.push(open);
        } else if (FEE_HINT.test(open.description)) {
            const recovered = classifySignedAmount(null, null, open.description);
            if (recovered.amountEuros != null) {
                open.amountEuros = recovered.amountEuros < 0 ? recovered.amountEuros : -Math.abs(recovered.amountEuros);
                open.debitEuros = Math.abs(open.amountEuros);
                virtualRows.push(open);
            } else {
                pushAnomaly(anomalies, {
                    code: 'TRAILING_FEE_NO_AMOUNT',
                    severity: 'warn',
                    message: `Ultima voce onere senza importo: ${open.description.slice(0, 80)}`,
                    page: open.page,
                    raw: open.rawCells.join(' | '),
                });
            }
        } else {
            ignored += 1;
        }
    }

    if (counters) counters.ignoredMarginNotes = ignored;
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

function buildSummaryWarning(
    movements: number,
    ignoredMarginNotes: number,
    anomalies: FinecoPdfAnomaly[]
): string | null {
    const warnCount = anomalies.filter((a) => a.severity === 'warn' || a.severity === 'error').length;
    const margin = ignoredMarginNotes;

    if (movements === 0) return null;
    if (warnCount === 0 && margin > 0) {
        return `${movements} movimenti estratti con successo • ${margin} note a margine escluse`;
    }
    if (warnCount > 0 && margin > 0) {
        return `${movements} movimenti estratti • ${margin} note a margine escluse • ${warnCount} da verificare`;
    }
    if (warnCount > 0) {
        return `${movements} movimenti estratti • ${warnCount} da verificare`;
    }
    if (movements > 0) {
        return `${movements} movimenti estratti con successo`;
    }
    return null;
}

function finalizeResult(
    movements: ParsedBankMovement[],
    warnings: string[],
    anomalies: FinecoPdfAnomaly[],
    textPreview: string[],
    ignoredMarginNotes: number,
    virtualRows?: FinecoVirtualRow[],
    headerBalances?: {
        openingBalanceCents: number | null;
        closingBalanceCents: number | null;
    }
): ParseFinecoPdfResult {
    const dates = movements
        .map((m) => m.accountingDate || m.valueDate)
        .filter((d): d is string => Boolean(d))
        .sort();
    const withBalance = [...movements].reverse().find((m) => m.balanceCents != null);
    const summary = buildSummaryWarning(movements.length, ignoredMarginNotes, anomalies);
    const mergedWarnings = summary ? [summary, ...warnings.filter((w) => w !== summary)] : warnings;

    const openingBalanceCents = headerBalances?.openingBalanceCents ?? null;
    const closingBalanceCents =
        headerBalances?.closingBalanceCents ?? withBalance?.balanceCents ?? null;

    if (openingBalanceCents != null || headerBalances?.closingBalanceCents != null) {
        const parts: string[] = [];
        if (openingBalanceCents != null) {
            parts.push(`apertura ${(openingBalanceCents / 100).toFixed(2)} €`);
        }
        if (headerBalances?.closingBalanceCents != null) {
            parts.push(`chiusura ${(headerBalances.closingBalanceCents / 100).toFixed(2)} €`);
        }
        mergedWarnings.push(`Saldi rendiconto Fineco: ${parts.join(' · ')}`);
    }

    return {
        movements,
        periodStart: dates[0] || null,
        periodEnd: dates[dates.length - 1] || null,
        openingBalanceCents,
        closingBalanceCents,
        warnings: mergedWarnings,
        textPreview: textPreview.length ? textPreview : undefined,
        anomalies,
        ignoredMarginNotes,
        parseSummary: summary || undefined,
        transactions: movementsToBankTransactions(movements),
        virtualRows,
    };
}

/**
 * Estrae testo posizionato (unpdf extractTextItems) e costruisce movimenti tabellari.
 * Note a margine/footer: esclusione silenziosa. Anomalie warn restano in JSON senza bloccare.
 */
export async function parseFinecoPdfTabular(buffer: Buffer): Promise<ParseFinecoPdfResult> {
    const anomalies: FinecoPdfAnomaly[] = [];
    const warnings: string[] = [];
    const counters = { ignoredMarginNotes: 0 };

    try {
        const { ensurePdfDomPolyfills } = await import('@/lib/financial/bankStatements/pdfDomPolyfill');
        ensurePdfDomPolyfills();

        const { extractTextItems, getDocumentProxy } = await import('unpdf');
        const pdf = await getDocumentProxy(new Uint8Array(buffer));
        const { items: pageItems, totalPages } = await extractTextItems(pdf);

        if (!pageItems?.length) {
            warnings.push('PDF senza item di testo posizionati (possibile scansione).');
            return finalizeResult([], warnings, anomalies, [], 0);
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

        // Testo pagina (item concatenati) per saldo iniziale/finale in header
        const pageTexts = pages.map((p) =>
            p
                .map((it) => it.str)
                .join(' ')
                .replace(/\s+/g, ' ')
        );
        const headerBalances = extractFinecoHeaderBalances(pageTexts);

        const virtualRows = convertPositionedItemsToVirtualRows(pages, anomalies, counters);
        const movements = virtualRowsToMovements(virtualRows);

        if (movements.length === 0) {
            warnings.push(
                `Parser tabellare: 0 movimenti su ${totalPages} pagine. Preferisci CSV Fineco se persiste.`
            );
        }

        return finalizeResult(
            movements,
            warnings,
            anomalies,
            textPreview,
            counters.ignoredMarginNotes,
            virtualRows,
            headerBalances
        );
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[parseFinecoPdfTabular]', msg);
        anomalies.push({ code: 'EXTRACT_FAILED', severity: 'error', message: msg });
        warnings.push(`Estrazione PDF tabellare fallita (${msg}).`);
        return finalizeResult([], warnings, anomalies, [], 0);
    }
}
