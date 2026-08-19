/**
 * Skill Pack fiscale/finanziario Alberto (ispirato a xNunc.ai).
 * Formule e checklist modulari — non sostituiscono il professionista abilitato.
 * Riferimenti: L. 193/2024, DL 179/2012 art. 25, DPR 633/72 (IVA).
 */

import {
    scorporaIvaFloreale,
    scorporaIvaOrdinaria,
    scorporaVenditaFloreale,
    VAT_RATE_FLORAL,
    VAT_RATE_ORDINARY,
} from '@/lib/financial/vat';

// ─── 1. WACC & Valuation ─────────────────────────────────────────────────────

export type WaccInput = {
    /** Risk-free rate (es. BTP 10Y), decimale 0.03 = 3%. */
    riskFreeRate: number;
    /** Equity market risk premium. */
    equityRiskPremium: number;
    /** Beta levered (osservato / target). */
    betaLevered: number;
    /** Costo del debito pre-tasse. */
    costOfDebtPreTax: number;
    /** Aliquota marginale IRES(+IRAP) approssimata, es. 0.24. */
    taxRate: number;
    /** Valore di mercato equity E. */
    equityValue: number;
    /** Valore di mercato debito D. */
    debtValue: number;
};

export type WaccResult = {
    costOfEquity: number;
    costOfDebtAfterTax: number;
    weightEquity: number;
    weightDebt: number;
    wacc: number;
};

/** CAPM: Re = Rf + βL × ERP */
export function calculateCostOfEquityCapm(params: {
    riskFreeRate: number;
    betaLevered: number;
    equityRiskPremium: number;
}): number {
    return params.riskFreeRate + params.betaLevered * params.equityRiskPremium;
}

/**
 * Hamada: βU = βL / (1 + (1−t)×D/E)
 * βL = βU × (1 + (1−t)×D/E)
 */
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

/** WACC = We×Re + Wd×Rd×(1−t) */
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
    const wacc = weightEquity * costOfEquity + weightDebt * costOfDebtAfterTax;
    return { costOfEquity, costOfDebtAfterTax, weightEquity, weightDebt, wacc };
}

/** Valutazione semplificata: EV ≈ FCFF / (WACC − g) se WACC > g. */
export function gordonGrowthEnterpriseValue(params: {
    nextYearFcff: number;
    wacc: number;
    perpetualGrowth: number;
}): number | null {
    if (params.wacc <= params.perpetualGrowth) return null;
    return params.nextYearFcff / (params.wacc - params.perpetualGrowth);
}

// ─── 2. Startup Innovativa Compliance ────────────────────────────────────────

export type StartupInnovativaChecklistInput = {
    /** Spese R&S / costi totali (0–1). Soglia tipica ≥ 15%. */
    rdSpendRatio?: number | null;
    /** Quota personale qualificato (0–1). Soglia tipica ≥ 1/3. */
    qualifiedStaffRatio?: number | null;
    hasRegisteredPatentOrSoftware?: boolean | null;
    distributesProfits?: boolean | null;
    /** Anni di permanenza in sezione speciale (max 5). */
    yearsInSpecialSection?: number | null;
    /** Requisiti dimensionali/temporali L. 193/2024 (flag verificato esternamente). */
    meetsDimensionalTemporalRequirements?: boolean | null;
};

export type ChecklistItem = {
    id: string;
    label: string;
    ok: boolean | null;
    detail: string;
    severity: 'critical' | 'high' | 'medium' | 'info';
};

export type StartupInnovativaChecklistResult = {
    items: ChecklistItem[];
    allCriticalOk: boolean;
    summary: string;
    normativeRefs: string[];
};

/**
 * Checklist interattiva requisiti startup innovativa.
 * Valutazione preliminare — confermare su Registro Imprese / professionista.
 */
export function evaluateStartupInnovativaCompliance(
    input: StartupInnovativaChecklistInput
): StartupInnovativaChecklistResult {
    const items: ChecklistItem[] = [];

    const rd = input.rdSpendRatio;
    items.push({
        id: 'rd_15',
        label: 'Spese R&S ≥ 15% dei costi',
        ok: rd == null ? null : rd >= 0.15,
        detail:
            rd == null
                ? 'Dato R&S mancante — Verify su bilanci / prospetto costi'
                : `Rapporto R&S osservato: ${(rd * 100).toFixed(1)}% (soglia 15%)`,
        severity: 'critical',
    });

    const staff = input.qualifiedStaffRatio;
    const ip = Boolean(input.hasRegisteredPatentOrSoftware);
    const staffOrIp =
        staff == null && input.hasRegisteredPatentOrSoftware == null
            ? null
            : ip || (staff != null && staff >= 1 / 3);
    items.push({
        id: 'staff_or_ip',
        label: '≥ 1/3 personale qualificato OPPURE brevetto/software registrato',
        ok: staffOrIp,
        detail: ip
            ? 'IP/brevetto/software dichiarato presente'
            : staff == null
              ? 'Manca quota personale qualificato e flag IP'
              : `Personale qualificato: ${(staff * 100).toFixed(1)}% (soglia ~33,3%)`,
        severity: 'critical',
    });

    items.push({
        id: 'no_profit_distribution',
        label: 'Vincolo: niente distribuzione utili (finché in regime)',
        ok:
            input.distributesProfits == null
                ? null
                : input.distributesProfits === false,
        detail:
            input.distributesProfits == null
                ? 'Verificare delibere assembleari / bilancio'
                : input.distributesProfits
                  ? 'Attenzione: distribuzione utili segnalata'
                  : 'Nessuna distribuzione utili dichiarata',
        severity: 'critical',
    });

    const years = input.yearsInSpecialSection;
    items.push({
        id: 'max_5_years',
        label: 'Permanenza sezione speciale ≤ 5 anni',
        ok: years == null ? null : years <= 5,
        detail:
            years == null
                ? 'Verificare data iscrizione sezione speciale (Registro Imprese)'
                : `Anni in sezione: ${years} (max 5)`,
        severity: 'critical',
    });

    items.push({
        id: 'l193_dimensional',
        label: 'Requisiti dimensionali/temporali L. 193/2024',
        ok:
            input.meetsDimensionalTemporalRequirements == null
                ? null
                : Boolean(input.meetsDimensionalTemporalRequirements),
        detail:
            'Confermare su Normattiva / MIMIT / Registro Imprese (Tier 1) — non inventare soglie',
        severity: 'high',
    });

    const known = items.filter((i) => i.ok !== null);
    const criticalFails = items.filter((i) => i.severity === 'critical' && i.ok === false);
    const allCriticalOk =
        criticalFails.length === 0 &&
        items.filter((i) => i.severity === 'critical').every((i) => i.ok !== false);

    return {
        items,
        allCriticalOk,
        summary: `Checklist startup: ${known.filter((i) => i.ok).length}/${known.length} verificati OK; criticità aperte: ${criticalFails.length}. Valutazione preliminare soggetta a conferma del professionista abilitato.`,
        normativeRefs: ['DL 179/2012 art. 25', 'L. 193/2024', 'Registro Imprese — sezione speciale'],
    };
}

// ─── 3. Tax & IVA Analyzer ───────────────────────────────────────────────────

export const CFO_VAT_FLORAL = VAT_RATE_FLORAL;
export const CFO_VAT_ORDINARY = VAT_RATE_ORDINARY;

export function analyzeSaleVat(params: {
    grossCents: number;
    accessoryCents?: number;
}) {
    return scorporaVenditaFloreale(params);
}

export function analyzeFloralVat(grossCents: number) {
    return scorporaIvaFloreale(grossCents);
}

export function analyzeOrdinaryVat(grossCents: number) {
    return scorporaIvaOrdinaria(grossCents);
}

/** Scadenze liquidazione IVA trimestrale (indicative — verificare calendario AdE anno corrente). */
export function ivaTrimestraleF24Deadlines(year: number): Array<{
    quarter: 1 | 2 | 3 | 4;
    periodLabel: string;
    indicativeDueDate: string;
    note: string;
}> {
    return [
        {
            quarter: 1,
            periodLabel: `Q1 ${year}`,
            indicativeDueDate: `${year}-05-16`,
            note: 'Liquidazione IVA Q1 — verificare proroghe AdE / festività',
        },
        {
            quarter: 2,
            periodLabel: `Q2 ${year}`,
            indicativeDueDate: `${year}-09-16`,
            note: 'Liquidazione IVA Q2',
        },
        {
            quarter: 3,
            periodLabel: `Q3 ${year}`,
            indicativeDueDate: `${year}-11-16`,
            note: 'Liquidazione IVA Q3',
        },
        {
            quarter: 4,
            periodLabel: `Q4 ${year}`,
            indicativeDueDate: `${year + 1}-03-16`,
            note: 'Liquidazione IVA Q4 / acconto — verificare disposizioni AdE',
        },
    ];
}

export type CostDeductibilityHint = {
    category: string;
    typicallyDeductible: boolean | 'partial';
    note: string;
};

export function costDeductibilityHints(): CostDeductibilityHint[] {
    return [
        {
            category: 'Commissioni Stripe / gateway (reverse charge UE)',
            typicallyDeductible: true,
            note: 'Costo deducibile; IVA RC da gestire in F24 se applicabile',
        },
        {
            category: 'Compensi fioristi partner',
            typicallyDeductible: true,
            note: 'Costo di produzione — tracciare fatture/ricevute passive',
        },
        {
            category: 'SaaS estero (Cursor, cloud, ads)',
            typicallyDeductible: true,
            note: 'Spesso reverse charge / esterometro — Verify prassi AdE',
        },
        {
            category: 'Omaggi / rappresentanza',
            typicallyDeductible: 'partial',
            note: 'Limiti di deducibilità — non generalizzare senza norma',
        },
    ];
}

// ─── 4. Financial Health & Runway ────────────────────────────────────────────

export type RunwayInput = {
    cashOnHandCents: number;
    /** Uscita netta media mensile (burn). Se negativo = cash-in netto. */
    monthlyBurnCents: number;
};

export type RunwayResult = {
    cashOnHandCents: number;
    monthlyBurnCents: number;
    runwayMonths: number | null;
    status: 'runway_ok' | 'runway_tight' | 'runway_critical' | 'cash_positive';
};

export function calculateRunwayMonths(input: RunwayInput): RunwayResult {
    const cash = Math.round(input.cashOnHandCents);
    const burn = Math.round(input.monthlyBurnCents);
    if (burn <= 0) {
        return {
            cashOnHandCents: cash,
            monthlyBurnCents: burn,
            runwayMonths: null,
            status: 'cash_positive',
        };
    }
    const months = cash / burn;
    const status =
        months < 3 ? 'runway_critical' : months < 6 ? 'runway_tight' : 'runway_ok';
    return {
        cashOnHandCents: cash,
        monthlyBurnCents: burn,
        runwayMonths: Math.round(months * 10) / 10,
        status,
    };
}

/** Burn rate ≈ max(0, uscite − entrate) su finestra, normalizzato a mese. */
export function estimateMonthlyBurnCents(params: {
    inflowsCents: number;
    outflowsCents: number;
    windowDays: number;
}): number {
    const netOut = Math.max(0, params.outflowsCents - params.inflowsCents);
    const days = Math.max(params.windowDays, 1);
    return Math.round((netOut * 30) / days);
}

export type ContributionMarginInput = {
    revenueCents: number;
    variableCostCents: number;
    channelOrProduct: string;
};

export type ContributionMarginResult = {
    channelOrProduct: string;
    revenueCents: number;
    variableCostCents: number;
    contributionCents: number;
    marginRatio: number | null;
};

export function calculateContributionMargin(
    input: ContributionMarginInput
): ContributionMarginResult {
    const revenue = Math.round(input.revenueCents);
    const variable = Math.round(input.variableCostCents);
    const contribution = revenue - variable;
    return {
        channelOrProduct: input.channelOrProduct,
        revenueCents: revenue,
        variableCostCents: variable,
        contributionCents: contribution,
        marginRatio: revenue === 0 ? null : contribution / revenue,
    };
}

export function operatingCashFlowSimple(params: {
    inflowsCents: number;
    outflowsCents: number;
}): number {
    return Math.round(params.inflowsCents) - Math.round(params.outflowsCents);
}

/** Catalogo skill per prompt / tool-calling. */
export const ALBERTO_CFO_SKILL_CATALOG = [
    {
        id: 'wacc_valuation',
        name: 'WACC & Valuation',
        exports: [
            'calculateWacc',
            'calculateCostOfEquityCapm',
            'unleverBeta',
            'releverBeta',
            'gordonGrowthEnterpriseValue',
        ],
    },
    {
        id: 'startup_innovativa',
        name: 'Startup Innovativa Compliance',
        exports: ['evaluateStartupInnovativaCompliance'],
    },
    {
        id: 'tax_iva',
        name: 'Tax & IVA Analyzer',
        exports: [
            'analyzeSaleVat',
            'analyzeFloralVat',
            'analyzeOrdinaryVat',
            'ivaTrimestraleF24Deadlines',
            'costDeductibilityHints',
        ],
    },
    {
        id: 'financial_health',
        name: 'Financial Health & Runway',
        exports: [
            'calculateRunwayMonths',
            'estimateMonthlyBurnCents',
            'calculateContributionMargin',
            'operatingCashFlowSimple',
        ],
    },
] as const;

export function describeAlbertoCfoSkillsForPrompt(): string {
    return [
        '## Skill Pack fiscale/finanziario (xNunc-inspired)',
        ...ALBERTO_CFO_SKILL_CATALOG.map(
            (s) => `- ${s.name} (${s.id}): ${s.exports.join(', ')}`
        ),
        'Usa le formule del pack; per dati reali invoca i tool CFO read-only (getCfoQuarterlyTaxSummary, getStripeCashOverview, getFloristPayoutStatus, getCompanyFinancialHealth).',
        'Non inventare numeri di bilancio: se il tool non è disponibile, dichiara dato mancante e Escalate.',
    ].join('\n');
}
