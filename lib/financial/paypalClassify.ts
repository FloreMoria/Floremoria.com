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

/**
 * Merchant SaaS / tool / abbonamenti: uscite = SPESE_SAAS; crediti = RIMBORSI (mai 60100).
 */
export const SAAS_MERCHANT_RE =
    /GOOGLE|OPENAI|CHATGPT|ANTHROPIC|CLAUDE\.?\s*AI|CURSOR|VERCEL|GITHUB|MICROSOFT|META\s*ADS|FACEBOOK|AWS|AMAZON\s*WEB|DROPBOX|SLACK|NOTION|ADOBE|ZOOM|SUPABASE|TWILIO|FUTURIA|HEROKU|DIGITALOCEAN|CLOUDFLARE|LINEAR\.APP|FIGMA|CANVA|NOTION|JETBRAINS|APPLE\.COM\/BILL|GOOGLE\s*PAYMENT/i;

/** Movimenti interni PayPal (netto/esborso) — non sono lordo vendita né spesa. */
const INTERNAL_NET_RE =
    /importo\s+pagato|denaro\s+raccolto\s+per\s+esborso|general\s+withdrawal|user\s+initiated\s+withdrawal|currency\s+conversion|conversione\s+valuta|temporary\s+hold/i;

/** Autorizzazioni che spesso duplicano il carico carta (stesso giorno/importo). */
const AUTH_DUP_RE = /autorizzazione\s+generica|general\s+authorization/i;

export type PaypalClassifyInput = {
    description: string;
    grossCents: number;
    feeCents?: number;
    eventCode?: string | null;
    payerEmail?: string | null;
    counterpartyName?: string | null;
};

export type PaypalClassifyResult = {
    /** false = non scrivere su ledger (rumore interno). */
    record: boolean;
    category: LedgerCategory;
    direction: 'ENTRATA' | 'USCITA';
    reason: string;
};

function blob(input: PaypalClassifyInput): string {
    return `${input.description || ''} ${input.counterpartyName || ''} ${input.payerEmail || ''}`;
}

/**
 * Decide se e come registrare una TX PayPal (non FEE).
 */
export function classifyPaypalTransaction(input: PaypalClassifyInput): PaypalClassifyResult {
    const desc = (input.description || '').trim();
    const text = blob(input);
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

    // Netto / esborso interni: mai in Prima Nota come ricavo/costo commerciale
    if (INTERNAL_NET_RE.test(desc) || INTERNAL_NET_RE.test(text)) {
        return {
            record: false,
            category: 'ALTRI_COSTI',
            direction: gross >= 0 ? 'ENTRATA' : 'USCITA',
            reason: 'skip_internal_net_or_payout_bookkeeping',
        };
    }

    const isSaas = SAAS_MERCHANT_RE.test(text);

    // Credito da merchant SaaS (rimborso/parziale) — mai 60100 Ricavi da Vendite
    if (gross > 0 && isSaas) {
        return {
            record: true,
            category: 'RIMBORSI',
            direction: 'ENTRATA',
            reason: 'saas_credit_not_revenue',
        };
    }

    // Uscita verso merchant SaaS / abbonamenti
    if (gross < 0 && isSaas) {
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
        if (gross > 0) {
            return {
                record: false,
                category: 'RICAVI_VENDITE',
                direction: 'ENTRATA',
                reason: 'skip_generic_credit_no_fee',
            };
        }
        return {
            record: false,
            category: 'ALTRI_COSTI',
            direction: 'USCITA',
            reason: 'skip_generic_debit_no_fee',
        };
    }

    if (/refund|rimborso|chargeback|storno/i.test(desc) || code === 'T1107' || code === 'T1106') {
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

    return {
        record: true,
        category: 'ALTRI_COSTI',
        direction: 'USCITA',
        reason: 'other_out',
    };
}

export function isSaasPaypalDescription(description: string, counterparty?: string | null): boolean {
    return SAAS_MERCHANT_RE.test(`${description || ''} ${counterparty || ''}`);
}

export function isPaypalInternalNetNoise(description: string): boolean {
    return INTERNAL_NET_RE.test(description || '');
}

export function isPaypalAuthDuplicateCandidate(description: string): boolean {
    return AUTH_DUP_RE.test(description || '');
}
