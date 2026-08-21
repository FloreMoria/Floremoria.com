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
    /^([+-]?\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\s*(?:€|EUR|euro)?\s*$/i;
const AMOUNT_INLINE_RE =
    /([+-]?\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\s*(?:€|EUR)\b/i;
const MONTH_YEAR_RE = new RegExp(`^(${MONTH_NAMES})(?:\\s+(\\d{4}))?$`, 'i');
const DAY_RE = /^(\d{1,2})$/;
const DAY_MONTH_RE = new RegExp(`^(\\d{1,2})\\s+(${MONTH_NAMES})(?:\\s+(\\d{4}))?$`, 'i');
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const IT_DATE_RE = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/;

const TYPE_HINT_RE =
    /^(bonifico|sepa\b|addebito|accredito|canone|imposta\b|pagamento\b|prelievo|versamento|giroconto|stipendio|ricarica|carta\b|pos\b|sdd\b|rid\b|f24\b|competenz)/i;

export type FinecoPasteMovement = ParsedBankMovement & {
    typology: string | null;
    dedupKey: string;
};

function parseEuroToCents(raw: string): number | null {
    const cleaned = raw.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 100);
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

/** Chiave dedup: TRN/TransID se presente, altrimenti data|importo|causale normalizzata. */
export function buildFinecoDedupKey(
    dateIso: string | null,
    amountCents: number,
    description: string
): string {
    const u = description.toUpperCase();
    const trn =
        u.match(/\b(?:TRN|TRANS(?:ACTION)?\s*ID|TRANSID|ID\s*TRN|CRO|C\.?R\.?O\.?)[:\s#]*([A-Z0-9]{6,})/)?.[1] ||
        u.match(/\b([A-Z0-9]{16,34})\b/)?.[1];
    if (trn && /[A-Z]/.test(trn) && /\d/.test(trn)) {
        return `trn:${trn}`;
    }
    const date = dateIso || 'nodate';
    const norm = normalizeCausale(description).slice(0, 160);
    return `${date}|${amountCents}|${norm}`;
}

function extractAmount(line: string): { cents: number; rest: string } | null {
    const trimmed = line.trim();
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
        .map((l) => l.replace(/\u00a0/g, ' ').trim())
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
            // Aggiorna il draft aperto (es. giorno "20" seguito da "agosto")
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
            // Giorno standalone: nuovo movimento
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
            // Tipologia tipicamente subito sopra l'importo: già nel draft
            pushCurrent();
            continue;
        }

        if (TYPE_HINT_RE.test(line)) {
            const d = ensureDraft();
            // Se c'è già descrizione e tipologia, questa riga è tipologia
            if (d.descParts.length > 0 && !d.typology) {
                d.typology = line;
            } else if (!d.typology && d.descParts.length === 0) {
                // Tipologia prima della causale (raro): tieni come typology
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
        // Evita doppione causale === tipologia
        if (
            draft.typology &&
            normalizeCausale(description) === normalizeCausale(draft.typology)
        ) {
            description = draft.typology;
        } else if (draft.typology) {
            description = description
                ? `${description} · ${draft.typology}`
                : draft.typology;
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

    // Dedup interno al paste
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
        closingBalanceCents: null,
        warnings,
        anomalies,
        parseSummary,
    };
}
