/**
 * Modulo 5 — Equity & Fundraising.
 * Cap table, pre/post-money, diluizione, SAFE, Work for Equity, ESOP.
 */

export const EQUITY_FUNDRAISING_SKILL_ID = 'equity_fundraising' as const;

export type CapTableRow = {
    shareholder: string;
    shares: number;
    ownershipPct: number;
};

export function buildCapTable(
    holders: Array<{ shareholder: string; shares: number }>
): CapTableRow[] {
    const total = holders.reduce((s, h) => s + Math.max(0, h.shares), 0) || 1;
    return holders.map((h) => ({
        shareholder: h.shareholder,
        shares: h.shares,
        ownershipPct: Math.round((h.shares / total) * 10000) / 100,
    }));
}

export type RoundSimulation = {
    preMoney: number;
    raiseAmount: number;
    postMoney: number;
    investorOwnershipPct: number;
    founderDilutionPct: number;
};

/** Simulazione round priced: post = pre + raise; % investor = raise / post. */
export function simulatePricedRound(params: {
    preMoney: number;
    raiseAmount: number;
    founderOwnershipBeforePct?: number;
}): RoundSimulation {
    const pre = Math.max(0, params.preMoney);
    const raise = Math.max(0, params.raiseAmount);
    const post = pre + raise;
    const investorOwnershipPct = post > 0 ? (raise / post) * 100 : 0;
    const founderBefore = params.founderOwnershipBeforePct ?? 100;
    const founderAfter = founderBefore * (1 - investorOwnershipPct / 100);
    return {
        preMoney: pre,
        raiseAmount: raise,
        postMoney: post,
        investorOwnershipPct: Math.round(investorOwnershipPct * 100) / 100,
        founderDilutionPct: Math.round((founderBefore - founderAfter) * 100) / 100,
    };
}

export type SafeConversionHint = {
    investment: number;
    valuationCap?: number | null;
    discount?: number | null;
    /** Pre-money del round di conversione. */
    nextRoundPreMoney: number;
    impliedPricePerShareNote: string;
    ownershipApproxPct: number | null;
};

/**
 * Conversione SAFE semplificata (cap o sconto sul pre-money successivo).
 * Non sostituisce term sheet legale.
 */
export function approximateSafeConversion(params: {
    investment: number;
    valuationCap?: number | null;
    discount?: number | null;
    nextRoundPreMoney: number;
}): SafeConversionHint {
    const discount = params.discount ?? 0;
    const discountedVal = params.nextRoundPreMoney * (1 - discount);
    const effectiveVal =
        params.valuationCap != null
            ? Math.min(params.valuationCap, discountedVal)
            : discountedVal;
    const post = effectiveVal + params.investment;
    const ownership =
        post > 0 ? (params.investment / post) * 100 : null;
    return {
        investment: params.investment,
        valuationCap: params.valuationCap ?? null,
        discount: params.discount ?? null,
        nextRoundPreMoney: params.nextRoundPreMoney,
        impliedPricePerShareNote:
            'Stima ownership su post-money implicito; Verify clausole pro-rata / MFN / conversion mechanics',
        ownershipApproxPct:
            ownership == null ? null : Math.round(ownership * 100) / 100,
    };
}

export type WorkForEquityHint = {
    equityPct: number;
    impliedValueAtPostMoney: number;
    note: string;
};

export function workForEquityImpliedValue(params: {
    equityPct: number;
    postMoney: number;
}): WorkForEquityHint {
    const value = (params.equityPct / 100) * params.postMoney;
    return {
        equityPct: params.equityPct,
        impliedValueAtPostMoney: Math.round(value * 100) / 100,
        note: 'Work for Equity: aspetti fiscali/contributivi delicati — Escalate commercialista/lavoro',
    };
}

export type EsopPoolPlan = {
    poolPctOfFullyDiluted: number;
    sharesInPool: number;
    fullyDilutedShares: number;
    note: string;
};

export function planEsopPool(params: {
    fullyDilutedShares: number;
    poolPct: number;
}): EsopPoolPlan {
    const pct = Math.min(Math.max(params.poolPct, 0), 100);
    const shares = Math.round((params.fullyDilutedShares * pct) / 100);
    return {
        poolPctOfFullyDiluted: pct,
        sharesInPool: shares,
        fullyDilutedShares: params.fullyDilutedShares,
        note: 'ESOP/Stock option: piano e vesting da formalizzare; Verify normativa e fiscalità assegnazioni',
    };
}

export const equityFundraisingSkillMeta = {
    id: EQUITY_FUNDRAISING_SKILL_ID,
    module: 5 as const,
    name: 'Equity & Fundraising',
    normativeRefs: ['Prassi term sheet', 'Work for Equity — normativa IT', 'Piani di incentivazione'],
};
