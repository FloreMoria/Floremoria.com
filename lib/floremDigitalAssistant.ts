/**
 * FLOREM_NET — Customer Success digitale.
 *
 * - Assistente conversazionale del brand: **VERA** (vedi organigramma .cursorrules).
 * - Parola d’ordine riservata al cliente per richiedere un operatore umano: **UMANO**
 *   (futuro: parsing in chat/WhatsApp/widget; qui solo contratto e hook `data-*` sulla home).
 */
export const FLOREM_DIGITAL_ASSISTANT_NAME = 'VERA' as const;
export const FLOREM_HUMAN_OPERATOR_TRIGGER = 'UMANO' as const;

export type FloremDigitalAssistantName = typeof FLOREM_DIGITAL_ASSISTANT_NAME;
export type FloremHumanOperatorTrigger = typeof FLOREM_HUMAN_OPERATOR_TRIGGER;
