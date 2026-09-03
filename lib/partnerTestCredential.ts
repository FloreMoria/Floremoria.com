/**
 * Credenziali API partner sandbox (`fmp_test_…`) → ordini isolati da produzione/fioristi/contabilità.
 */

export const PARTNER_TEST_PUBLIC_ID_PREFIX = 'fmp_test_';

export type PartnerApiPaymentKind = 'PARTNER_TERMS' | 'TEST_MOCK_PAID';

export function isPartnerTestCredential(publicId: string | null | undefined): boolean {
    return Boolean(publicId?.trim().startsWith(PARTNER_TEST_PUBLIC_ID_PREFIX));
}

export function resolvePartnerApiPaymentKind(isTestCredential: boolean): PartnerApiPaymentKind {
    return isTestCredential ? 'TEST_MOCK_PAID' : 'PARTNER_TERMS';
}

export function buildPartnerTestFinanceNote(publicId: string): string {
    return `Sandbox API (${publicId}). Ordine di test: non assegnato a fiorista reale, escluso da contabilità.`;
}
