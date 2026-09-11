/**
 * Piano dei conti — conti di transito gateway e feature flag Fase 2.
 */

export const ACCOUNT_BANCA_FINECO = '10100 - Banca Fineco' as const;
export const ACCOUNT_BANCA_CO_STRIPE = '10300 - Banca c/o Stripe' as const;
/** Conto di pagamento PayPal — spese / residuali / giroconti. Non è transito vendite. */
export const ACCOUNT_BANCA_CO_PAYPAL = '10200 - Banca c/o PayPal' as const;
export const ACCOUNT_STRIPE_LEGACY = '10300 - Conto Stripe' as const;
export const ACCOUNT_PAYPAL_LEGACY = '10200 - Conto PayPal' as const;
export const ACCOUNT_CREDITI_CLIENTI = '11000 - Crediti v/clienti' as const;
/**
 * Incassi fuori gateway: storici .eu, bonifici diretti, pagamenti da identificare.
 * Non devono entrare nel transito Stripe (unico transito vendite).
 */
export const ACCOUNT_INCASSI_FUORI_GATEWAY =
    '10400 - Incassi fuori gateway (non Stripe)' as const;
export const ACCOUNT_RICAVI_VENDITE = '60100 - Ricavi da Vendite' as const;
export const ACCOUNT_CONTRIBUTI_ESERCIZIO = '65000 - Contributi in conto esercizio' as const;
export const ACCOUNT_COMMISSIONI_INCASSI = '70200 - Commissioni su incassi' as const;
export const ACCOUNT_DA_CLASSIFICARE = '17900 - Partite da classificare' as const;

export type GatewayKind = 'STRIPE' | 'PAYPAL';

/**
 * Solo Stripe è transito vendite. PayPal restituisce il conto di pagamento
 * (stesso codice mastro) ma non va trattato come gamba ricavi gateway.
 */
export function gatewayTransitAccount(kind: GatewayKind): string {
    return kind === 'STRIPE' ? ACCOUNT_BANCA_CO_STRIPE : ACCOUNT_BANCA_CO_PAYPAL;
}

/**
 * Feature flag classificazione payout per payout id.
 * Disattivabile: FINANCE_PAYOUT_ID_CLASSIFICATION=0|false|off
 * Default: attivo (1).
 */
export function isPayoutIdClassificationEnabled(): boolean {
    const raw = (process.env.FINANCE_PAYOUT_ID_CLASSIFICATION || '1').trim().toLowerCase();
    if (raw === '0' || raw === 'false' || raw === 'off' || raw === 'no') return false;
    return true;
}
