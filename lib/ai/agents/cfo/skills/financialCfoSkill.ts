/**
 * Modulo 3 — CFO finanziario.
 * Cash flow, burn, runway, EBITDA, contribuzione, WC, WACC/CAPM/Hamada.
 */

export const FINANCIAL_CFO_SKILL_ID = 'financial_cfo' as const;

export function operatingCashFlowCents(params: {
    inflowsCents: number;
    outflowsCents: number;
}): number {
    return Math.round(params.inflowsCents) - Math.round(params.outflowsCents);
}

export function estimateMonthlyBurnCents(params: {
    inflowsCents: number;
    outflowsCents: number;
    windowDays: number;
}): number {
    const netOut = Math.max(0, params.outflowsCents - params.inflowsCents);
    const days = Math.max(params.windowDays, 1);
    return Math.round((netOut * 30) / days);
}

export type RunwayResult = {
    cashOnHandCents: number;
    monthlyBurnCents: number;
    runwayMonths: number | null;
    status: 'runway_ok' | 'runway_tight' | 'runway_critical' | 'cash_positive';
};

export function calculateRunwayMonths(params: {
    cashOnHandCents: number;
    monthlyBurnCents: number;
}): RunwayResult {
    const cash = Math.round(params.cashOnHandCents);
    const burn = Math.round(params.monthlyBurnCents);
    if (burn <= 0) {
        return {
            cashOnHandCents: cash,
            monthlyBurnCents: burn,
            runwayMonths: null,
            status: 'cash_positive',
        };
    }
    const months = cash / burn;
    return {
        cashOnHandCents: cash,
        monthlyBurnCents: burn,
        runwayMonths: Math.round(months * 10) / 10,
        status: months < 3 ? 'runway_critical' : months < 6 ? 'runway_tight' : 'runway_ok',
    };
}

export function calculateEbitdaCents(params: {
    revenuesCents: number;
    operatingCostsCents: number;
    /** Costi non cash già esclusi da operatingCosts se ammortamenti separati. */
    dAndACents?: number;
}): number {
    // Se D&A sono dentro operatingCosts, EBITDA = ricavi − costi + D&A
    const ebit =
        Math.round(params.revenuesCents) - Math.round(params.operatingCostsCents);
    return ebit + Math.round(params.dAndACents ?? 0);
}

export function contributionMarginUnit(params: {
    unitPriceCents: number;
    variableCostCents: number;
}): { contributionCents: number; marginRatio: number | null } {
    const contribution = Math.round(params.unitPriceCents - params.variableCostCents);
    const price = Math.round(params.unitPriceCents);
    return {
        contributionCents: contribution,
        marginRatio: price === 0 ? null : contribution / price,
    };
}

export function workingCapitalCents(params: {
    currentAssetsCents: number;
    currentLiabilitiesCents: number;
}): number {
    return Math.round(params.currentAssetsCents - params.currentLiabilitiesCents);
}

export type WaccInput = {
    riskFreeRate: number;
    equityRiskPremium: number;
    betaLevered: number;
    costOfDebtPreTax: number;
    taxRate: number;
    equityValue: number;
    debtValue: number;
};

export type WaccResult = {
    costOfEquity: number;
    costOfDebtAfterTax: number;
    weightEquity: number;
    weightDebt: number;
    wacc: number;
};

export function calculateCostOfEquityCapm(params: {
    riskFreeRate: number;
    betaLevered: number;
    equityRiskPremium: number;
}): number {
    return params.riskFreeRate + params.betaLevered * params.equityRiskPremium;
}

export function unleverBeta(params: {
    betaLevered: number;
    debtToEquity: number;
    taxRate: number;
}): number {
    const denom = 1 + (1 - params.taxRate) * params.debtToEquity;
    if (denom <= 0) return params.betaLevered;
    return params.betaLevered / denom;
}

export function releverBeta(params: {
    betaUnlevered: number;
    debtToEquity: number;
    taxRate: number;
}): number {
    return params.betaUnlevered * (1 + (1 - params.taxRate) * params.debtToEquity);
}

export function calculateWacc(input: WaccInput): WaccResult {
    const total = Math.max(input.equityValue + input.debtValue, 1e-9);
    const weightEquity = input.equityValue / total;
    const weightDebt = input.debtValue / total;
    const costOfEquity = calculateCostOfEquityCapm({
        riskFreeRate: input.riskFreeRate,
        betaLevered: input.betaLevered,
        equityRiskPremium: input.equityRiskPremium,
    });
    const costOfDebtAfterTax = input.costOfDebtPreTax * (1 - input.taxRate);
    return {
        costOfEquity,
        costOfDebtAfterTax,
        weightEquity,
        weightDebt,
        wacc: weightEquity * costOfEquity + weightDebt * costOfDebtAfterTax,
    };
}

export function gordonGrowthEnterpriseValue(params: {
    nextYearFcff: number;
    wacc: number;
    perpetualGrowth: number;
}): number | null {
    if (params.wacc <= params.perpetualGrowth) return null;
    return params.nextYearFcff / (params.wacc - params.perpetualGrowth);
}

export const financialCfoSkillMeta = {
    id: FINANCIAL_CFO_SKILL_ID,
    module: 3 as const,
    name: 'CFO',
    normativeRefs: ['Best practice FP&A', 'CAPM / Hamada (teoria finanza)'],
};
