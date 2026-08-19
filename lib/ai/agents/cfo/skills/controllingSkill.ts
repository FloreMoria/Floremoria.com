/**
 * Modulo 7 — Controlling.
 * Budget vs Actual, KPI (CAC/LTV), scenari Base / Stress / Crescita.
 */

export const CONTROLLING_SKILL_ID = 'controlling' as const;

export type BudgetActualLine = {
    metric: string;
    budgetCents: number;
    actualCents: number;
    varianceCents: number;
    variancePct: number | null;
};

export function budgetVsActual(params: {
    metric: string;
    budgetCents: number;
    actualCents: number;
}): BudgetActualLine {
    const budget = Math.round(params.budgetCents);
    const actual = Math.round(params.actualCents);
    const variance = actual - budget;
    return {
        metric: params.metric,
        budgetCents: budget,
        actualCents: actual,
        varianceCents: variance,
        variancePct: budget === 0 ? null : variance / budget,
    };
}

export function buildControllingDashboard(params: {
    revenueBudgetCents: number;
    revenueActualCents: number;
    grossMarginBudgetCents: number;
    grossMarginActualCents: number;
    ebitdaBudgetCents: number;
    ebitdaActualCents: number;
    cashBudgetCents: number;
    cashActualCents: number;
}): BudgetActualLine[] {
    return [
        budgetVsActual({
            metric: 'Revenue',
            budgetCents: params.revenueBudgetCents,
            actualCents: params.revenueActualCents,
        }),
        budgetVsActual({
            metric: 'Gross Margin',
            budgetCents: params.grossMarginBudgetCents,
            actualCents: params.grossMarginActualCents,
        }),
        budgetVsActual({
            metric: 'EBITDA',
            budgetCents: params.ebitdaBudgetCents,
            actualCents: params.ebitdaActualCents,
        }),
        budgetVsActual({
            metric: 'Cash',
            budgetCents: params.cashBudgetCents,
            actualCents: params.cashActualCents,
        }),
    ];
}

export type UnitEconomics = {
    cacCents: number;
    ltvCents: number;
    ltvToCac: number | null;
    healthy: boolean | null;
};

export function computeCacLtv(params: {
    salesMarketingCents: number;
    newCustomers: number;
    avgGrossMarginPerCustomerCents: number;
    avgRetentionMonths: number;
}): UnitEconomics {
    const customers = Math.max(params.newCustomers, 0);
    const cac =
        customers === 0
            ? 0
            : Math.round(params.salesMarketingCents / customers);
    const ltv = Math.round(
        params.avgGrossMarginPerCustomerCents * Math.max(params.avgRetentionMonths, 0)
    );
    const ratio = cac === 0 ? null : ltv / cac;
    return {
        cacCents: cac,
        ltvCents: ltv,
        ltvToCac: ratio == null ? null : Math.round(ratio * 100) / 100,
        healthy: ratio == null ? null : ratio >= 3,
    };
}

export type ScenarioSet = {
    base: { revenueCents: number; cashCents: number; note: string };
    stress: { revenueCents: number; cashCents: number; note: string };
    growth: { revenueCents: number; cashCents: number; note: string };
};

/** Scenari: Base, Stress (−30% ricavi), Crescita (+25% ricavi) con shock cassa proporzionale. */
export function generatePlanningScenarios(params: {
    baseRevenueCents: number;
    baseCashCents: number;
}): ScenarioSet {
    const rev = Math.round(params.baseRevenueCents);
    const cash = Math.round(params.baseCashCents);
    return {
        base: {
            revenueCents: rev,
            cashCents: cash,
            note: 'Scenario base — forecast corrente',
        },
        stress: {
            revenueCents: Math.round(rev * 0.7),
            cashCents: Math.round(cash * 0.75),
            note: 'Stress test: −30% revenue, pressione cassa',
        },
        growth: {
            revenueCents: Math.round(rev * 1.25),
            cashCents: Math.round(cash * 1.1),
            note: 'Crescita: +25% revenue (investimenti da validare)',
        },
    };
}

export const controllingSkillMeta = {
    id: CONTROLLING_SKILL_ID,
    module: 7 as const,
    name: 'Controlling',
    normativeRefs: ['FP&A best practice', 'Unit economics SaaS/marketplace'],
};
