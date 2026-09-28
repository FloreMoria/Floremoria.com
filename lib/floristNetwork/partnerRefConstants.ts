/** Cookie sessione QR Partner (Art. 2.3) — valore = FloristScanEvent.sessionToken. */
export const PARTNER_REF_COOKIE = 'floremoria_partner_ref';

/** Chiave in Order.veraWorkflowFlags: token QR in attesa di conferma pagamento. */
export const PARTNER_QR_SESSION_FLAG = 'partnerQrSessionToken';

/** Metadata Stripe Checkout / PaymentIntent. */
export const PARTNER_QR_SESSION_METADATA_KEY = 'partnerQrSessionToken';

export const PARTNER_REF_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    path: '/',
    // Nessuna maxAge/expires → cookie di sessione (si cancella alla chiusura browser;
    // una nuova scansione lo sostituisce).
};
