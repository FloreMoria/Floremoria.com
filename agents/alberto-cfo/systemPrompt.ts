/**
 * Re-export comodo del System Prompt Master Alberto (percorso agents/).
 * Implementazione canonica: lib/ai/agents/cfoAgent.ts
 */
export {
    ALBERTO_CFO_SYSTEM_PROMPT,
    FLOREMORIA_CFO_DEFAULT_META,
    getAlbertoCfoContext,
    getAlbertoCfoContextSync,
    ALBERTO_CFO_TOOLS,
    type AlbertoCfoCompanyMeta,
    type AlbertoCfoRuntimeContext,
} from '@/lib/ai/agents/cfoAgent';

export {
    getCfoQuarterlyTaxSummary,
    getStripeCashOverview,
    getFloristPayoutStatus,
    getCompanyFinancialHealth,
    loadAlbertoCfoLiveSnapshot,
} from '@/lib/ai/agents/cfoTools';

export {
    calculateWacc,
    evaluateStartupInnovativaCompliance,
    analyzeSaleVat,
    calculateRunwayMonths,
    ALBERTO_CFO_SKILL_CATALOG,
} from '@/lib/ai/agents/cfoSkills';
