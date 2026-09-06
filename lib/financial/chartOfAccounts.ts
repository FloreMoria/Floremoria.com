/**
 * Piano dei conti — conti di transito gateway e feature flag Fase 2.
 */

export const ACCOUNT_BANCA_FINECO = '10100 - Banca Fineco' as const;
export const ACCOUNT_BANCA_CO_STRIPE = '10300 - Banca c/o Stripe' as const;
export const ACCOUNT_BANCA_CO_PAYPAL = '10200 - Banca c/o PayPal' as const;
export const ACCOUNT_STRIPE_LEGACY = '10300 - Conto Stripe' as const;
export const ACCOUNT_PAYPAL_LEGACY = '10200 - Conto PayPal' as const;
export const ACCOUNT_CREDITI_CLIENTI = '11000 - Crediti v/clienti' as const;
export const ACCOUNT_RICAVI_VENDITE = '60100 - Ricavi da Vendite' as const;
export const ACCOUNT_COMMISSIONI_INCASSI = '70200 - Commissioni su incassi' as const;
export const ACCOUNT_DA_CLASSIFICARE = '17900 - Partite da classificare' as const;

export type GatewayKind = 'STRIPE' | 'PAYPAL';

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
