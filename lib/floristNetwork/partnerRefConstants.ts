import { getFloremAuthCookieBase } from '@/lib/authCookieDomain';

/** Cookie sessione QR Partner (Art. 2.3) — valore = FloristScanEvent.sessionToken. */
export const PARTNER_REF_COOKIE = 'floremoria_partner_ref';

/** Chiave in Order.veraWorkflowFlags: token QR in attesa di conferma pagamento. */
export const PARTNER_QR_SESSION_FLAG = 'partnerQrSessionToken';

/** Metadata Stripe Checkout / PaymentIntent. */
export const PARTNER_QR_SESSION_METADATA_KEY = 'partnerQrSessionToken';

/**
 * Opzioni cookie QR: su floremoria.com usa domain=.floremoria.com
 * (sopravvive al redirect apex→www). Su preview Vercel resta host-only.
 */
export function getPartnerRefCookieOptions(request: {
    headers: Headers;
    url: string;
}): {
    httpOnly: true;
    secure: boolean;
    sameSite: 'lax';
    path: '/';
    domain?: string;
} {
    const base = getFloremAuthCookieBase(request);
    return {
        httpOnly: true,
        secure: base.secure,
        sameSite: 'lax',
        path: '/',
        ...(base.domain ? { domain: base.domain } : {}),
    };
}
