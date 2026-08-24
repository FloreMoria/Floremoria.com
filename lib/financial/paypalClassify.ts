/**
 * Classificazione movimenti PayPal per Prima Nota.
 * Esclude conversioni/hold/netti speculari; mappa SaaS e fee corretti.
 */

import type { LedgerCategory } from '@/lib/financial/historicalLedgerTypes';

/** Event code PayPal da saltare (non sono ricavi/costi commerciali). */
const SKIP_EVENT_CODES = new Set([
    'T0200', // currency conversion
    'T0201',
    'T0202',
    'T1105', // reserve hold
    'T1110', // dispute hold
    'T1111', // hold cancellation
    'T1200', // account-to-account
    'T1201',
]);

const SAAS_MERCHANT_RE =
    /GOOGLE\s*\*?GOOGLE\s*ONE|GOOGLE\s*\*?\s*YOUTUBE|GOOGLE\s*\*?\s*CLOUD|GOOGLE\s*\*?\s*WORKSPACE|OPENAI|ANTHROPIC|CURSOR|VERCEL|GITHUB|MICROSOFT|META\s*ADS|FACEBOOK|AWS|AMAZON\s*WEB|DROPBOX|SLACK|NOTION|ADOBE|ZOOM/i;

export type PaypalClassifyInput = {
    description: string;
    grossCents: number;
    feeCents?: number;
    eventCode?: string | null;
    payerEmail?: string | null;
};

export type PaypalClassifyResult = {
    /** false = non scrivere su ledger (rumore interno). */
    record: boolean;
    category: LedgerCategory;
    direction: 'ENTRATA' | 'USCITA';
    reason: string;
};

/**
 * Decide se e come registrare una TX PayPal (non FEE).
 */
export function classifyPaypalTransaction(input: PaypalClassifyInput): PaypalClassifyResult {
    const desc = (input.description || '').trim();
    const code = String(input.eventCode || '')
        .trim()
        .toUpperCase();
    const gross = input.grossCents;

    if (code && SKIP_EVENT_CODES.has(code)) {
        return {
            record: false,
            category: 'ALTRI_COSTI',
            direction: 'USCITA',
            reason: `skip_event_${code}`,
        };
    }

    // Uscita verso merchant SaaS / abbonamenti (es. Google One)
    if (gross < 0 && SAAS_MERCHANT_RE.test(desc)) {
        return {
            record: true,
            category: 'SPESE_SAAS',
            direction: 'USCITA',
            reason: 'saas_merchant',
        };
    }

    // Descrizione generica "PayPal {id}" senza soggetto: spesso netto/conversione speculare
    const genericOnly = /^paypal\s+[A-Z0-9]+$/i.test(desc) || /^paypal$/i.test(desc);
    if (genericOnly && (!input.feeCents || input.feeCents === 0)) {
        // Positivi generici senza fee = quasi sempre mirror di netto o conversione
        if (gross > 0) {
            return {
                record: false,
                category: 'RICAVI_VENDITE',
                direction: 'ENTRATA',
                reason: 'skip_generic_credit_no_fee',
            };
        }
        // Negativi generici senza fee: storno netto / transfer interno
        return {
            record: false,
            category: 'ALTRI_COSTI',
            direction: 'USCITA',
            reason: 'skip_generic_debit_no_fee',
        };
    }

    if (/refund|rimborso|chargeback/i.test(desc) || code === 'T1107' || code === 'T1106') {
        return {
            record: true,
            category: 'RIMBORSI',
            direction: gross >= 0 ? 'ENTRATA' : 'USCITA',
            reason: 'refund',
        };
    }

    if (gross >= 0) {
        return {
            record: true,
            category: 'RICAVI_VENDITE',
            direction: 'ENTRATA',
            reason: 'payment_in',
        };
    }

    // Altre uscite (merchant non SaaS)
    if (SAAS_MERCHANT_RE.test(desc)) {
        return {
            record: true,
            category: 'SPESE_SAAS',
            direction: 'USCITA',
            reason: 'saas_out',
        };
    }

    return {
        record: true,
        category: 'ALTRI_COSTI',
        direction: 'USCITA',
        reason: 'other_out',
    };
}

export function isSaasPaypalDescription(description: string): boolean {
    return SAAS_MERCHANT_RE.test(description || '');
}
