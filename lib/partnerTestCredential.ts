/**
 * Credenziali API partner sandbox (`fmp_test_…`) → ordini isolati da produzione/fioristi/contabilità.
 * Chiavi test su endpoint live → errore esplicito (mai 200 OK).
 */

export const PARTNER_TEST_PUBLIC_ID_PREFIX = 'fmp_test_';
export const PARTNER_LIVE_PUBLIC_ID_PREFIX = 'fmp_live_';

export type PartnerApiPaymentKind = 'PARTNER_TERMS' | 'TEST_MOCK_PAID';

export function isPartnerTestCredential(publicId: string | null | undefined): boolean {
    return Boolean(publicId?.trim().startsWith(PARTNER_TEST_PUBLIC_ID_PREFIX));
}

export function isPartnerLiveCredential(publicId: string | null | undefined): boolean {
    return Boolean(publicId?.trim().startsWith(PARTNER_LIVE_PUBLIC_ID_PREFIX));
}

export function resolvePartnerApiPaymentKind(isTestCredential: boolean): PartnerApiPaymentKind {
    return isTestCredential ? 'TEST_MOCK_PAID' : 'PARTNER_TERMS';
}

export function buildPartnerTestFinanceNote(publicId: string): string {
    return `Sandbox API (${publicId}). Ordine di test: non assegnato a fiorista reale, escluso da contabilità.`;
}

/**
 * true se la richiesta colpisce l'ambiente di produzione (host live o NODE_ENV=production
 * senza flag esplicito di sandbox partner).
 */
export function isPartnerApiLiveRuntime(request?: Request): boolean {
    if (process.env.PARTNER_API_ALLOW_TEST_ON_LIVE === '1') return false;
    const host =
        request?.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ||
        request?.headers.get('host')?.trim() ||
        '';
    const h = host.toLowerCase();
    if (h.includes('localhost') || h.startsWith('127.') || h.includes('.local')) {
        return false;
    }
    if (h.includes('floremoria.com') || h.includes('vercel.app')) {
        return true;
    }
    return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

export const TEST_CREDENTIAL_ON_LIVE_ERROR = {
    code: 'TEST_CREDENTIAL_NOT_ALLOWED_IN_PRODUCTION',
    error:
        'Credenziale di test (fmp_test_…) non ammessa sull’endpoint di produzione. Usa fmp_live_… / fms_live_… oppure l’ambiente sandbox.',
} as const;
