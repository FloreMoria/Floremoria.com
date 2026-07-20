export {
    CONTEXT_ISOLATION_RULES,
    HISTORICAL_CONTEXT_DISAMBIGUATION,
    INTERNAL_STAFF_IDENTITIES,
    VERA_BRAND,
    VERA_SYSTEM_IDENTITY,
} from '@/lib/vera/constants';

export {
    buildCallerContextPromptBlock,
    resolveVeraCallerContext,
    type VeraCallerContext,
    type VeraConversationMode,
} from '@/lib/vera/callerContext';

export {
    buildMetodoFloremoriaBlock,
    METODO_FLOREMORIA_FEW_SHOT,
    METODO_FLOREMORIA_PRINCIPLES,
} from '@/lib/vera/metodoFloremoria';

export { buildVeraKnowledgeContext } from '@/lib/vera/knowledgeContext';
export { buildVeraWhatsAppSystemInstruction } from '@/lib/vera/systemPrompt';
export { buildGenderMorphologyBlock, detectGenderFromName, extractFirstNameFromProfile } from '@/lib/vera/genderFromName';
export { sanitizeWhatsAppDisplayName, isUsableWhatsAppPersonName } from '@/lib/vera/displayName';
export {
    buildSymmetricCourtesyReply,
    hasOperationalServiceIntent,
    isIsolatedCourtesyMessage,
    shouldSilenceVeraReply,
    VERA_INTENT_BEFORE_ACTION_RULE,
    VERA_SYMMETRIC_GREETING_RULE,
} from '@/lib/vera/courtesyDebounce';
export { buildPreAcquisitionLucianoReply, isPreAcquisitionIntent } from '@/lib/vera/preAcquisitionIntent';
export { listActiveVeraAlerts, setVeraOperationalAlert, clearVeraOperationalAlert } from '@/lib/vera/operationalAlerts';
export * from '@/lib/vera/orderWorkflow';
