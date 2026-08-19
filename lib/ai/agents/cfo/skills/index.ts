/**
 * Registro Skill Pack a 8 moduli — Alberto AI CFO / Tax Advisor.
 * Consumato da lib/ai/agents/cfoAgent.ts (System Prompt Master + contesto).
 */

import * as taxAdvisor from './taxAdvisorSkill';
import * as accounting from './accountingSkill';
import * as financialCfo from './financialCfoSkill';
import * as startupCompliance from './startupComplianceSkill';
import * as equityFundraising from './equityFundraisingSkill';
import * as incentivesGrants from './incentivesGrantsSkill';
import * as controlling from './controllingSkill';
import * as riskCompliance from './riskComplianceSkill';

export {
    taxAdvisor,
    accounting,
    financialCfo,
    startupCompliance,
    equityFundraising,
    incentivesGrants,
    controlling,
    riskCompliance,
};

export const CFO_SKILL_PACK = {
    version: '1.0.0',
    inspiredBy: ['xNunc.ai', 'docs/architecture/ai_cfo_team_specification.md'],
    modules: [
        {
            meta: taxAdvisor.taxAdvisorSkillMeta,
            api: [
                'scorporaIvaFlorealeDpr633',
                'scorporaIvaOrdinaria22',
                'scorporaVenditaMista',
                'estimateIresCents',
                'estimateIrapCents',
                'estimateWithholdingTaxCents',
                'buildF24DeadlineCalendar',
                'enterpriseCostDeductibilityRules',
                'reverseChargeIntracomHints',
            ],
        },
        {
            meta: accounting.accountingSkillMeta,
            api: [
                'CEE_CHART_OF_ACCOUNTS',
                'draftStripeSaleEntry',
                'draftPartnerPayoutEntry',
                'buildRateo',
                'buildRisconto',
                'straightLineDepreciationCents',
                'compareCashVsCompetence',
            ],
        },
        {
            meta: financialCfo.financialCfoSkillMeta,
            api: [
                'operatingCashFlowCents',
                'estimateMonthlyBurnCents',
                'calculateRunwayMonths',
                'calculateEbitdaCents',
                'contributionMarginUnit',
                'workingCapitalCents',
                'calculateWacc',
                'unleverBeta',
                'releverBeta',
                'gordonGrowthEnterpriseValue',
            ],
        },
        {
            meta: startupCompliance.startupComplianceSkillMeta,
            api: ['evaluateStartupInnovativaCompliance'],
        },
        {
            meta: equityFundraising.equityFundraisingSkillMeta,
            api: [
                'buildCapTable',
                'simulatePricedRound',
                'approximateSafeConversion',
                'workForEquityImpliedValue',
                'planEsopPool',
            ],
        },
        {
            meta: incentivesGrants.incentivesGrantsSkillMeta,
            api: [
                'GRANT_PROGRAM_CATALOG',
                'checkDeMinimisHeadroom',
                'listEligibleProgramsForStartup',
            ],
        },
        {
            meta: controlling.controllingSkillMeta,
            api: [
                'budgetVsActual',
                'buildControllingDashboard',
                'computeCacLtv',
                'generatePlanningScenarios',
            ],
        },
        {
            meta: riskCompliance.riskComplianceSkillMeta,
            api: [
                'scoreRisk',
                'buildComplianceCalendar',
                'assessLiquidityRisk',
                'detectBalanceAnomalies',
            ],
        },
    ],
} as const;

export type CfoSkillPack = typeof CFO_SKILL_PACK;

/** Blocco testuale per System Prompt / getAlbertoCfoContext. */
export function describeCfoSkillPackForPrompt(): string {
    const lines = [
        '## CFO Skill Pack — 8 moduli professionali (xNunc-inspired)',
        `Versione registry: ${CFO_SKILL_PACK.version}`,
        ...CFO_SKILL_PACK.modules.map(
            (m) =>
                `- Modulo ${m.meta.module}. ${m.meta.name} (\`${m.meta.id}\`): ${m.api.join(', ')}`
        ),
        'Invoca le API del modulo pertinente; per dati reali usa i tool Prisma read-only.',
        'Valutazione preliminare soggetta a conferma del professionista abilitato.',
    ];
    return lines.join('\n');
}

/** Alias legacy usato da cfoAgent / cfoSkills. */
export function describeAlbertoCfoSkillsForPrompt(): string {
    return describeCfoSkillPackForPrompt();
}

export const ALBERTO_CFO_SKILL_CATALOG = CFO_SKILL_PACK.modules.map((m) => ({
    id: m.meta.id,
    name: m.meta.name,
    module: m.meta.module,
    exports: m.api,
}));
