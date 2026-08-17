/**
 * Metodi di pagamento Checkout FloreMoria — garanzia PayPal.
 *
 * Perché (radice del bug ricorrente):
 * - Da maggio 2026 il checkout ha omesso `payment_method_types` per affidarsi ai
 *   Dynamic Payment Methods della Dashboard Stripe.
 * - Con quel modello PayPal può sparire in silenzio (toggle Dashboard, riconnessione
 *   PayPal, cambio config default) senza errori in codice — già segnalato dagli utenti.
 * - Forziamo esplicitamente `card` + `paypal`. Se Stripe rifiuta PayPal (account),
 *   facciamo fallback a sola carta + alert operativo, mai sparizione silenziosa.
 */

import type Stripe from 'stripe';
import { sendStaffPushNotification } from '@/lib/push/staffPush';

/** Metodi obbligatori sul Checkout pubblico. */
export const FLOREMORIA_CHECKOUT_PAYMENT_METHODS = ['card', 'paypal'] as const;

export type FloreMoriaCheckoutPaymentMethod =
    (typeof FLOREMORIA_CHECKOUT_PAYMENT_METHODS)[number];

function isPaypalUnavailableError(err: unknown): boolean {
    const e = err as {
        message?: string;
        code?: string;
        raw?: { message?: string; code?: string; param?: string };
    };
    const msg = `${e?.message || ''} ${e?.raw?.message || ''}`.toLowerCase();
    const param = `${e?.raw?.param || ''}`.toLowerCase();
    if (param.includes('paypal') || param.includes('payment_method_types')) return true;
    if (msg.includes('paypal')) return true;
    if (e?.code === 'invalid_request_error' && msg.includes('payment_method')) return true;
    return false;
}

async function alertPaypalMissing(reason: string): Promise<void> {
    console.error('[stripe-checkout] CRITICAL PayPal assente/non disponibile:', reason);
    await sendStaffPushNotification({
        title: '🚨 Checkout — PayPal non disponibile',
        body: reason.slice(0, 180),
        url: '/dashboard/finance',
        tag: 'stripe-paypal-missing',
    }).catch((err) => {
        console.warn('[stripe-checkout] Push staff PayPal fallita:', err);
    });
}

export interface CreateGuaranteedCheckoutSessionResult {
    session: Stripe.Checkout.Session;
    /** True se PayPal è tra i metodi della session creata. */
    paypalIncluded: boolean;
    /** True se siamo caduti sul fallback solo-carta. */
    usedCardOnlyFallback: boolean;
}

/**
 * Crea una Checkout Session con PayPal esplicito.
 * Fallback carta-only solo se Stripe rifiuta PayPal (con alert staff).
 */
export async function createGuaranteedCheckoutSession(
    stripe: Stripe,
    params: Omit<Stripe.Checkout.SessionCreateParams, 'payment_method_types'>
): Promise<CreateGuaranteedCheckoutSessionResult> {
    const base: Stripe.Checkout.SessionCreateParams = {
        ...params,
        // Locale IT: migliora etichette e ordering metodi su Checkout hosted.
        locale: params.locale ?? 'it',
    };

    try {
        const session = await stripe.checkout.sessions.create({
            ...base,
            payment_method_types: [...FLOREMORIA_CHECKOUT_PAYMENT_METHODS],
        });
        const paypalIncluded = (session.payment_method_types || []).includes('paypal');
        if (!paypalIncluded) {
            await alertPaypalMissing(
                `Session ${session.id} creata senza paypal nei payment_method_types=${JSON.stringify(session.payment_method_types)}`
            );
        }
        return { session, paypalIncluded, usedCardOnlyFallback: false };
    } catch (err) {
        if (!isPaypalUnavailableError(err)) {
            throw err;
        }

        const detail = err instanceof Error ? err.message : String(err);
        await alertPaypalMissing(
            `Stripe ha rifiutato payment_method_types incl. paypal — fallback sola carta. ${detail}`
        );

        const session = await stripe.checkout.sessions.create({
            ...base,
            payment_method_types: ['card'],
        });
        return { session, paypalIncluded: false, usedCardOnlyFallback: true };
    }
}
