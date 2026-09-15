/**
 * Destinatari email staff FloreMoria — instradamento fisso per ruolo.
 * Perché: evitare collasso di ops / contabilità / onboarding fioristi sullo stesso
 * indirizzo (bug: zone scoperte e BCC contabile finivano su ordini@).
 *
 * Override opzionali via env (produzione Vercel):
 * - FLOREM_STAFF_ORDERS_EMAIL
 * - FLOREM_STAFF_ACCOUNTING_EMAIL
 * - FLOREM_STAFF_FLORISTS_EMAIL
 */

export const DEFAULT_STAFF_ORDERS_EMAIL = 'ordini@floremoria.com';
export const DEFAULT_STAFF_ACCOUNTING_EMAIL = 'contabilita@floremoria.com';
export const DEFAULT_STAFF_FLORISTS_EMAIL = 'fioristi@floremoria.com';

/** Tipi loggati prima di ogni dispatch Resend. */
export type StaffMailEmailType =
    | 'order_ops'
    | 'order_accounting'
    | 'florist_partner_search'
    | 'partner_ops'
    | 'customer'
    | 'other';

function firstEmail(raw: string | undefined, fallback: string): string {
    const v = raw?.trim();
    return v || fallback;
}

/** Logistica / gestione ordini. */
export function staffOrdersEmail(): string {
    return firstEmail(process.env.FLOREM_STAFF_ORDERS_EMAIL, DEFAULT_STAFF_ORDERS_EMAIL);
}

/** Amministrazione / fatturazione (mai fallback su ordini@). */
export function staffAccountingEmail(): string {
    return firstEmail(
        process.env.FLOREM_STAFF_ACCOUNTING_EMAIL,
        DEFAULT_STAFF_ACCOUNTING_EMAIL
    );
}

/** Ricerca / onboarding fiorista per zone non coperte. */
export function staffFloristsEmail(): string {
    return firstEmail(
        process.env.FLOREM_STAFF_FLORISTS_EMAIL,
        DEFAULT_STAFF_FLORISTS_EMAIL
    );
}
