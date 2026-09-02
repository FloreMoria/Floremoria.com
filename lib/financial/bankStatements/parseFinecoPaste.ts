/**
 * Parser testo grezzo copiato dalla lista movimenti Fineco (home banking web/app).
 * Assumption: blocchi tipici = giorno → mese[/anno] → causale → tipologia → "€,cc EUR".
 */

import type { ParsedBankMovement, ParseBankStatementResult } from './types';

const MONTH_MAP: Record<string, number> = {
    gennaio: 1,
    febbraio: 2,
    marzo: 3,
    aprile: 4,
    maggio: 5,
    giugno: 6,
    luglio: 7,
    agosto: 8,
    settembre: 9,
    ottobre: 10,
    novembre: 11,
    dicembre: 12,
};

const MONTH_NAMES = Object.keys(MONTH_MAP).join('|');

const AMOUNT_RE =
    /^([+-]?\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}-?|[+-]?\d+,\d{2}|\(\d{1,3}(?:\.\d{3})*,\d{2}\)|\(\d+,\d{2}\))\s*(?:€|EUR|euro)?\s*$/i;
const AMOUNT_INLINE_RE =
    /([+-]?\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}-|[+-]?\d+,\d{2}|\(\d{1,3}(?:\.\d{3})*,\d{2}\))\s*(?:€|EUR)?\b/i;
const MONTH_YEAR_RE = new RegExp(`^(${MONTH_NAMES})(?:\\s+(\\d{4}))?$`, 'i');
const DAY_RE = /^(\d{1,2})$/;
const DAY_MONTH_RE = new RegExp(`^(\\d{1,2})\\s+(${MONTH_NAMES})(?:\\s+(\\d{4}))?$`, 'i');
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const IT_DATE_RE = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/;

const TYPE_HINT_RE =
    /^(bonifico|sepa\b|addebito|accredito|canone|imposta\b|bollo\b|commissione|pagamento\b|prelievo|versamento|giroconto|stipendio|ricarica|carta\b|pos\b|sdd\b|rid\b|f24\b|competenz|visa\b|mastercard|direct\s*debit)/i;

export type FinecoPasteMovement = ParsedBankMovement & {
    typology: string | null;
    dedupKey: string;
};

function normalizeAmountToken(raw: string): string {
    return raw
        .replace(/\u00a0/g, ' ')
        .replace(/[\u2212\u2013\u2014]/g, '-')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseEuroToCents(raw: string): number | null {
    let s = normalizeAmountToken(raw).replace(/\s/g, '').replace(/€/gi, '').replace(/EUR/gi, '');
    if (!s || s === '-' || s === '—') return null;
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
    s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    const cents = Math.round(Math.abs(n) * 100);
    return negative ? -cents : cents;
}

function pad2(n: number): string {
    return String(n).padStart(2, '0');
}

function toIso(year: number, month: number, day: number): string | null {
    if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
        return null;
    }
    const d = new Date(Date.UTC(year, month - 1, day));
    if (
        d.getUTCFullYear() !== year ||
        d.getUTCMonth() !== month - 1 ||
        d.getUTCDate() !== day
    ) {
        return null;
    }
    return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function normalizeCausale(desc: string): string {
    return desc
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

/** IBAN / creditor ID SDD (es. LU96ZZZ…) — non sono TRN univoci per movimento. */
export function looksLikeIbanOrCreditorId(token: string): boolean {
    const t = token.replace(/\s+/g, '').toUpperCase();
    if (t.length < 12) return false;
    if (/^[A-Z]{2}\d{2}ZZZ/i.test(t)) return true;
    if (/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/i.test(t)) return true;
    return false;
}

/** Estrae IBAN italiano o estero dalla causale Fineco. */
export function extractIbanToken(description: string): string | null {
    const compact = description.toUpperCase().replace(/\s+/g, '');
    const m = compact.match(/[A-Z]{2}\d{2}[A-Z0-9]{10,30}/);
    if (!m) return null;
    const iban = m[0];
    return looksLikeIbanOrCreditorId(iban) ? iban : null;
}

/** Beneficiario da riga "Beneficiario: …" (home banking Fineco). */
export function extractBeneficiaryToken(description: string): string | null {
    const m = description.match(/Beneficiario\s*:\s*([^|\n·]+?)(?:\s+IBAN\b|\s+Data\b|$)/i);
    if (!m) return null;
    const norm = normalizeCausale(m[1]).slice(0, 80);
    return norm || null;
}

/**
 * TRN/CRO/TransID espliciti o numeri lunghi Fineco (es. 260902333402969448032000000IT).
 */
export function extractBareFinecoTrn(description: string): string | null {
    const u = description.toUpperCase().replace(/\s+/g, ' ');
    const labeled = u.match(
        /\b(?:TRN|TRANS(?:ACTION)?\s*ID|TRANSID|ID\s*TRN|CRO|C\.?R\.?O\.?)\s*[:.#]?\s*([A-Z0-9][A-Z0-9\s]{5,72})/
    )?.[1];
    if (labeled) {
        let trn = labeled.replace(/\s+/g, '');
        // Taglia eventuale testo accidentale dopo il TRN numerico.
        trn = trn.match(/^(\d{12,32}IT?)/)?.[1] || trn;
        if (trn.length >= 8 && !looksLikeIbanOrCreditorId(trn)) return trn;
    }

    const bareMatches = [...u.matchAll(/\b(\d{20,32}IT?)\b/g)].map((m) => m[1]);
    const bare = bareMatches.sort((a, b) => b.length - a.length)[0];
    if (bare && !looksLikeIbanOrCreditorId(bare)) return bare;

    return null;
}

/**
 * Chiave dedup naturale Fineco.
 * Priorità: TRN univoco → data+importo+IBAN+beneficiario+causale.
 */
export function buildFinecoDedupKey(
    dateIso: string | null,
    amountCents: number,
    description: string
): string {
    const trn = extractBareFinecoTrn(description);
    const date = dateIso || 'nodate';

    if (trn) {
        return `trn:${trn}|${date}|${amountCents}`;
    }

    const iban = extractIbanToken(description);
    const payee = extractBeneficiaryToken(description);
    const norm = normalizeCausale(description).slice(0, 160);
    const parts = [date, String(amountCents)];
    if (iban) parts.push(`iban:${iban}`);
    if (payee) parts.push(`payee:${payee}`);
    parts.push(norm);
    return parts.join('|');
}

function extractAmount(line: string): { cents: number; rest: string } | null {
    const trimmed = normalizeAmountToken(line);
    const full = trimmed.match(AMOUNT_RE);
    if (full) {
        const cents = parseEuroToCents(full[1]);
        if (cents == null) return null;
        return { cents, rest: '' };
    }
    const inline = trimmed.match(AMOUNT_INLINE_RE);
    if (inline && inline.index != null) {
        const cents = parseEuroToCents(inline[1]);
        if (cents == null) return null;
        const rest = (trimmed.slice(0, inline.index) + trimmed.slice(inline.index + inline[0].length))
            .trim()
            .replace(/\s+/g, ' ');
        return { cents, rest };
    }
    return null;
}

/**
 * Interpreta testo copiato dalla lista movimenti Fineco.
 */
export function parseFinecoPasteText(
    rawText: string,
    opts?: { defaultYear?: number }
): ParseBankStatementResult & { pasteMovements: FinecoPasteMovement[] } {
    const defaultYear = opts?.defaultYear ?? new Date().getFullYear();
    const lines = rawText
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .map((l) => normalizeAmountToken(l.replace(/\u00a0/g, ' ')))
        .filter((l) => l.length > 0 && !/^lista\s+movimenti/i.test(l) && !/^saldo\b/i.test(l));

    let ctxYear = defaultYear;
    let ctxMonth: number | null = null;
    let ctxDay: number | null = null;

    type Draft = {
        day: number | null;
        month: number | null;
        year: number;
        descParts: string[];
        typology: string | null;
        amountCents: number | null;
    };

    const drafts: Draft[] = [];
    let current: Draft | null = null;

    const pushCurrent = () => {
        if (current && current.amountCents != null) {
            drafts.push(current);
        }
        current = null;
    };

    const ensureDraft = (): Draft => {
        if (!current) {
            current = {
                day: ctxDay,
                month: ctxMonth,
                year: ctxYear,
                descParts: [],
                typology: null,
                amountCents: null,
            };
        }
        return current;
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        const dayMonth = line.match(DAY_MONTH_RE);
        if (dayMonth) {
            pushCurrent();
            ctxDay = Number(dayMonth[1]);
            ctxMonth = MONTH_MAP[dayMonth[2].toLowerCase()] || null;
            if (dayMonth[3]) ctxYear = Number(dayMonth[3]);
            current = {
                day: ctxDay,
                month: ctxMonth,
                year: ctxYear,
                descParts: [],
                typology: null,
                amountCents: null,
            };
            continue;
        }

        const monthOnly = line.match(MONTH_YEAR_RE);
        if (monthOnly) {
            ctxMonth = MONTH_MAP[monthOnly[1].toLowerCase()] || ctxMonth;
            if (monthOnly[2]) ctxYear = Number(monthOnly[2]);
            if (current) {
                if (ctxMonth != null) current.month = ctxMonth;
                current.year = ctxYear;
            }
            continue;
        }

        const iso = line.match(ISO_DATE_RE);
        if (iso) {
            pushCurrent();
            ctxYear = Number(iso[1]);
            ctxMonth = Number(iso[2]);
            ctxDay = Number(iso[3]);
            current = {
                day: ctxDay,
                month: ctxMonth,
                year: ctxYear,
                descParts: [],
                typology: null,
                amountCents: null,
            };
            continue;
        }

        const itDate = line.match(IT_DATE_RE);
        if (itDate) {
            pushCurrent();
            let y = Number(itDate[3]);
            if (y < 100) y += 2000;
            ctxDay = Number(itDate[1]);
            ctxMonth = Number(itDate[2]);
            ctxYear = y;
            current = {
                day: ctxDay,
                month: ctxMonth,
                year: ctxYear,
                descParts: [],
                typology: null,
                amountCents: null,
            };
            continue;
        }

        if (DAY_RE.test(line) && Number(line) >= 1 && Number(line) <= 31) {
            pushCurrent();
            ctxDay = Number(line);
            current = {
                day: ctxDay,
                month: ctxMonth,
                year: ctxYear,
                descParts: [],
                typology: null,
                amountCents: null,
            };
            continue;
        }

        const amount = extractAmount(line);
        if (amount) {
            const d = ensureDraft();
            d.amountCents = amount.cents;
            if (amount.rest) {
                if (TYPE_HINT_RE.test(amount.rest) && !d.typology) {
                    d.typology = amount.rest;
                } else {
                    d.descParts.push(amount.rest);
                }
            }
            pushCurrent();
            continue;
        }

        if (TYPE_HINT_RE.test(line)) {
            const d = ensureDraft();
            if (d.descParts.length > 0 && !d.typology) {
                d.typology = line;
            } else if (!d.typology && d.descParts.length === 0) {
                d.typology = line;
            } else if (d.typology) {
                d.descParts.push(line);
            } else {
                d.typology = line;
            }
            continue;
        }

        const d = ensureDraft();
        d.descParts.push(line);
    }
    pushCurrent();

    const pasteMovements: FinecoPasteMovement[] = [];
    const anomalies: ParseBankStatementResult['anomalies'] = [];
    const warnings: string[] = [];

    drafts.forEach((draft, idx) => {
        if (draft.amountCents == null) {
            anomalies?.push({
                code: 'PASTE_NO_AMOUNT',
                message: `Blocco senza importo: ${(draft.descParts.join(' ') || '').slice(0, 80)}`,
                severity: 'warn',
                lineIndex: idx,
            });
            return;
        }
        const month = draft.month;
        const day = draft.day;
        let dateIso: string | null = null;
        if (month && day) {
            dateIso = toIso(draft.year, month, day);
        }
        if (!dateIso) {
            anomalies?.push({
                code: 'PASTE_NO_DATE',
                message: `Movimento senza data completa (importo ${(draft.amountCents / 100).toFixed(2)} €)`,
                severity: 'warn',
                lineIndex: idx,
            });
        }

        let description = draft.descParts.join(' · ').replace(/\s+/g, ' ').trim();
        if (
            draft.typology &&
            normalizeCausale(description) === normalizeCausale(draft.typology)
        ) {
            description = draft.typology;
        } else if (draft.typology) {
            description = description ? `${description} · ${draft.typology}` : draft.typology;
        }
        if (!description) description = draft.typology || 'Movimento Fineco (incolla)';

        const amountCents = draft.amountCents;
        const dedupKey = buildFinecoDedupKey(dateIso, amountCents, description);

        pasteMovements.push({
            lineIndex: pasteMovements.length,
            valueDate: dateIso,
            accountingDate: dateIso,
            description,
            amountCents,
            debitCents: amountCents < 0 ? Math.abs(amountCents) : null,
            creditCents: amountCents > 0 ? amountCents : null,
            balanceCents: null,
            typology: draft.typology,
            dedupKey,
            raw: {
                source: 'fineco_paste',
                typology: draft.typology,
                dedupKey,
            },
        });
    });

    const seen = new Set<string>();
    const unique: FinecoPasteMovement[] = [];
    for (const m of pasteMovements) {
        if (seen.has(m.dedupKey)) {
            warnings.push(`Duplicato interno rimosso: ${m.description.slice(0, 60)}`);
            continue;
        }
        seen.add(m.dedupKey);
        unique.push({ ...m, lineIndex: unique.length });
    }

    const dates = unique
        .map((m) => m.accountingDate)
        .filter((d): d is string => Boolean(d))
        .sort();

    const parseSummary =
        unique.length > 0
            ? `${unique.length} movimenti riconosciuti da testo Fineco${
                  anomalies?.length ? ` · ${anomalies.length} avvisi` : ''
              }`
            : 'Nessun movimento riconosciuto nel testo incollato';

    return {
        movements: unique,
        pasteMovements: unique,
        periodStart: dates[0] || null,
        periodEnd: dates[dates.length - 1] || null,
        openingBalanceCents: null,
        closingBalanceCents: null,
        warnings,
        anomalies,
        parseSummary,
    };
}
