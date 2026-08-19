/**
 * Compatibility layer — Skill Pack canonico in lib/ai/agents/cfo/skills/.
 * Mantiene gli export legacy usati da cfoTools / cfoAgent.
 */

import { contributionMarginUnit } from '@/lib/ai/agents/cfo/skills/financialCfoSkill';

export {
    CFO_SKILL_PACK,
    describeCfoSkillPackForPrompt,
    describeAlbertoCfoSkillsForPrompt,
    ALBERTO_CFO_SKILL_CATALOG,
} from '@/lib/ai/agents/cfo/skills';

export {
    scorporaIvaFlorealeDpr633 as analyzeFloralVat,
    scorporaIvaOrdinaria22 as analyzeOrdinaryVat,
    scorporaVenditaMista as analyzeSaleVat,
    buildF24DeadlineCalendar as ivaTrimestraleF24Deadlines,
    enterpriseCostDeductibilityRules as costDeductibilityHints,
    VAT_RATE_FLORAL as CFO_VAT_FLORAL,
    VAT_RATE_ORDINARY as CFO_VAT_ORDINARY,
} from '@/lib/ai/agents/cfo/skills/taxAdvisorSkill';

export {
    calculateWacc,
    calculateCostOfEquityCapm,
    unleverBeta,
    releverBeta,
    gordonGrowthEnterpriseValue,
    calculateRunwayMonths,
    estimateMonthlyBurnCents,
    operatingCashFlowCents as operatingCashFlowSimple,
    contributionMarginUnit,
    type WaccInput,
    type WaccResult,
    type RunwayResult,
} from '@/lib/ai/agents/cfo/skills/financialCfoSkill';

export { evaluateStartupInnovativaCompliance } from '@/lib/ai/agents/cfo/skills/startupComplianceSkill';

/** Alias contribution margin canale (legacy shape). */
export function calculateContributionMargin(input: {
    revenueCents: number;
    variableCostCents: number;
    channelOrProduct: string;
}) {
    const unit = contributionMarginUnit({
        unitPriceCents: input.revenueCents,
        variableCostCents: input.variableCostCents,
    });
    return {
        channelOrProduct: input.channelOrProduct,
        revenueCents: input.revenueCents,
        variableCostCents: input.variableCostCents,
        contributionCents: unit.contributionCents,
        marginRatio: unit.marginRatio,
    };
}
