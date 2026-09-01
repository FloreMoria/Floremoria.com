/**
 * Incrocio payout gateway ↔ movimenti Fineco (solo STRIPE/PAYPAL).
 * Ignora bonifici fioristi, F24, oneri conto e altri movimenti Prima Nota.
 */
import type { GatewaySyncRow } from '@/lib/financial/gatewaySyncRows';

export type GatewayBankLine = {
    id: string;
    accountingDate: string | null;
    description: string;
    amountCents: number;
};

export type GatewayPayoutBankMatch = {
    payoutRowId: string;
    gateway: 'stripe' | 'paypal';
    transactionId: string;
    payoutAmountCents: number;
    payoutDate: string;
    bankLineId: string | null;
    bankAmountCents: number | null;
    bankDate: string | null;
    bankDescription: string | null;
    dayDelta: number | null;
    amountDeltaCents: number | null;
    matched: boolean;
};

export type GatewayBankMatchSummary = {
    gateway: 'stripe' | 'paypal';
    /** Payout registrati dal gateway (API/sync). */
    gatewayPayoutCents: number;
    /** Accrediti Fineco correlati (solo righe filtrate gateway). */
    finecoGatewayCreditCents: number;
    /** Payout gateway abbinati a riga bancaria. */
    finecoMatchedPayoutCents: number;
    /** Payout gateway senza accrediti Fineco nel periodo. */
    finecoUnmatchedPayoutCents: number;
    /** Accrediti Fineco gateway senza payout API corrispondente. */
    finecoUnmatchedBankCents: number;
    matchCount: number;
    unmatchedPayoutCount: number;
    unmatchedBankCount: number;
    matches: GatewayPayoutBankMatch[];
    unmatchedBankLines: Array<{
        id: string;
        date: string | null;
        description: string;
        amountCents: number;
    }>;
};

const AMOUNT_TOLERANCE_CENTS = 150; // €1,50 tolleranza arrotondamenti
const MATCH_DAY_WINDOW = 7;

/** Accrediti Stripe/PayPal e addebiti carta PAYPAL * su Fineco. */
export function isGatewayRelatedFinecoMovement(description: string, amountCents: number): boolean {
    const u = String(description || '').toUpperCase().trim();
    if (!u) return false;

    if (amountCents > 0) {
        if (/\bSTRIPE\b/.test(u)) return true;
        if (/\bPAYPAL\b/.test(u) && !/\b(CASHBACK|RIMBORSO|REFUND|STORNO)\b/.test(u)) return true;
        if (/\b(TRANSFER|TRF|BONIFICO)\b/.test(u) && /\b(STRIPE|PAYPAL)\b/.test(u)) return true;
        return false;
    }

    if (amountCents < 0) {
        if (/^PAYPAL\s*\*/.test(u)) return true;
        if (/\bPAYPAL\b/.test(u) && /\b(CARTA|CARD|RID|ADDEBITO|SDD|SEPA|PRELIEVO)\b/.test(u)) {
            return true;
        }
    }

    return false;
}

function dayMs(iso: string | null | undefined): number | null {
    if (!iso) return null;
    const t = Date.parse(String(iso).slice(0, 10));
    return Number.isFinite(t) ? t : null;
}

function withinDays(a: string | null, b: string | null, days: number): boolean {
    const da = dayMs(a);
    const db = dayMs(b);
    if (da == null || db == null) return false;
    return Math.abs(da - db) <= days * 24 * 60 * 60 * 1000;
}

function amountClose(a: number, b: number, tolerance = AMOUNT_TOLERANCE_CENTS): boolean {
    return Math.abs(Math.abs(a) - Math.abs(b)) <= tolerance;
}

/**
 * Abbina payout gateway (Stripe/PayPal) agli accrediti Fineco filtrati.
 * Log strutturato su console per audit operativo.
 */
export function matchGatewayPayoutsToFineco(input: {
    gateway: 'stripe' | 'paypal';
    payoutRows: GatewaySyncRow[];
    bankLines: GatewayBankLine[];
}): GatewayBankMatchSummary {
    const { gateway, payoutRows, bankLines } = input;

    const payouts = payoutRows
        .filter((r) => r.gateway === gateway && r.movementKind === 'payout')
        .map((r) => ({
            row: r,
            amountCents: Math.abs(r.netCents || r.grossCents || 0),
            date: r.occurredAt,
        }))
        .filter((p) => p.amountCents > 0);

    const credits = bankLines
        .filter((l) => l.amountCents > 0 && isGatewayRelatedFinecoMovement(l.description, l.amountCents))
        .filter((l) => {
            const u = l.description.toUpperCase();
            if (gateway === 'stripe') return /\bSTRIPE\b/.test(u);
            return /\bPAYPAL\b/.test(u);
        });

    const usedBank = new Set<string>();
    const matches: GatewayPayoutBankMatch[] = [];

    const sortedPayouts = [...payouts].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    for (const p of sortedPayouts) {
        let best: GatewayBankLine | null = null;
        let bestScore = -1;

        for (const bank of credits) {
            if (usedBank.has(bank.id)) continue;
            if (!withinDays(p.date, bank.accountingDate, MATCH_DAY_WINDOW)) continue;
            if (!amountClose(p.amountCents, bank.amountCents)) continue;

            const dayDelta =
                dayMs(p.date) != null && dayMs(bank.accountingDate) != null
                    ? Math.round(
                          Math.abs(dayMs(p.date)! - dayMs(bank.accountingDate)!) /
                              (24 * 60 * 60 * 1000)
                      )
                    : null;
            const amountDelta = Math.abs(p.amountCents - bank.amountCents);
            const score = 100 - (dayDelta || 0) * 3 - amountDelta;

            if (score > bestScore) {
                bestScore = score;
                best = bank;
            }
        }

        if (best) {
            usedBank.add(best.id);
            const dayDelta =
                dayMs(p.date) != null && dayMs(best.accountingDate) != null
                    ? Math.round(
                          Math.abs(dayMs(p.date)! - dayMs(best.accountingDate)!) /
                              (24 * 60 * 60 * 1000)
                      )
                    : null;
            matches.push({
                payoutRowId: p.row.id,
                gateway,
                transactionId: p.row.transactionId,
                payoutAmountCents: p.amountCents,
                payoutDate: p.date,
                bankLineId: best.id,
                bankAmountCents: best.amountCents,
                bankDate: best.accountingDate,
                bankDescription: best.description,
                dayDelta,
                amountDeltaCents: Math.abs(p.amountCents - best.amountCents),
                matched: true,
            });
            console.info(
                `[gateway-bank-match] ${gateway} payout ${p.row.transactionId} €${(p.amountCents / 100).toFixed(2)} ↔ Fineco ${best.id} €${(best.amountCents / 100).toFixed(2)} (Δgiorni=${dayDelta ?? '?'})`
            );
        } else {
            matches.push({
                payoutRowId: p.row.id,
                gateway,
                transactionId: p.row.transactionId,
                payoutAmountCents: p.amountCents,
                payoutDate: p.date,
                bankLineId: null,
                bankAmountCents: null,
                bankDate: null,
                bankDescription: null,
                dayDelta: null,
                amountDeltaCents: null,
                matched: false,
            });
            console.warn(
                `[gateway-bank-match] ${gateway} payout NON abbinato: ${p.row.transactionId} €${(p.amountCents / 100).toFixed(2)} del ${p.date.slice(0, 10)}`
            );
        }
    }

    const unmatchedBankLines = credits
        .filter((c) => !usedBank.has(c.id))
        .map((c) => ({
            id: c.id,
            date: c.accountingDate,
            description: c.description,
            amountCents: c.amountCents,
        }));

    for (const u of unmatchedBankLines) {
        console.warn(
            `[gateway-bank-match] ${gateway} accrediti Fineco senza payout API: ${u.id} €${(u.amountCents / 100).toFixed(2)} — ${u.description.slice(0, 80)}`
        );
    }

    const gatewayPayoutCents = payouts.reduce((s, p) => s + p.amountCents, 0);
    const finecoGatewayCreditCents = credits.reduce((s, c) => s + c.amountCents, 0);
    const finecoMatchedPayoutCents = matches
        .filter((m) => m.matched)
        .reduce((s, m) => s + m.payoutAmountCents, 0);
    const finecoUnmatchedPayoutCents = matches
        .filter((m) => !m.matched)
        .reduce((s, m) => s + m.payoutAmountCents, 0);
    const finecoUnmatchedBankCents = unmatchedBankLines.reduce((s, l) => s + l.amountCents, 0);

    console.info(
        `[gateway-bank-match] ${gateway} riepilogo: payout API €${(gatewayPayoutCents / 100).toFixed(2)}, Fineco gateway €${(finecoGatewayCreditCents / 100).toFixed(2)}, abbinati €${(finecoMatchedPayoutCents / 100).toFixed(2)}, scoperti payout €${(finecoUnmatchedPayoutCents / 100).toFixed(2)}, scoperti banca €${(finecoUnmatchedBankCents / 100).toFixed(2)}`
    );

    return {
        gateway,
        gatewayPayoutCents,
        finecoGatewayCreditCents,
        finecoMatchedPayoutCents,
        finecoUnmatchedPayoutCents,
        finecoUnmatchedBankCents,
        matchCount: matches.filter((m) => m.matched).length,
        unmatchedPayoutCount: matches.filter((m) => !m.matched).length,
        unmatchedBankCount: unmatchedBankLines.length,
        matches,
        unmatchedBankLines,
    };
}
