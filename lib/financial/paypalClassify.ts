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

/** Ricariche/provviste da carta o conto — giroconto, non spesa operativa. */
export const PAYPAL_FUNDING_LABEL_RE =
    /blocco generico|ricarica conto|prelievo generico da(?:\s+carta|\s+banca)?|add funds from a (?:card|bank)|generic (?:card|bank) (?:withdrawal|funding)|bank deposit to pp|fondi aggiunti|autorizzazione generica|general authorization|card funding|funding from/i;

/** Ricariche/provviste da carta o conto — giroconto, non spesa operativa. */
const FUNDING_EVENT_CODES = new Set([
    'T0300', // bank deposit / card funding
    'T0301',
    'T0302',
]);

/** Trasferimenti verso conto bancario (payout). */
const PAYOUT_EVENT_CODES = new Set([
    'T0400', // general withdrawal
    'T0401',
    'T0403',
]);

/** Incassi e-commerce PayPal. */
const ORDER_EVENT_CODES = new Set([
    'T0006', // express checkout
    'T0007', // website payment
    'T0011', // mobile payment
]);

export type PaypalGatewayMovementKind =
    | 'incasso'
    | 'commissione'
    | 'payout'
    | 'rimborso'
    | 'altro'
    | 'skip';

export type PaypalGatewayClassifyResult = {
    record: boolean;
    movementKind: PaypalGatewayMovementKind;
    label: string;
    isFunding: boolean;
    reason: string;
};

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

    if (code && FUNDING_EVENT_CODES.has(code)) {
        return {
            record: false,
            category: 'ALTRI_COSTI',
            direction: gross >= 0 ? 'ENTRATA' : 'USCITA',
            reason: `skip_funding_${code}`,
        };
    }

    if (PAYPAL_FUNDING_LABEL_RE.test(text)) {
        return {
            record: false,
            category: 'ALTRI_COSTI',
            direction: gross >= 0 ? 'ENTRATA' : 'USCITA',
            reason: 'skip_funding_label',
        };
    }

    if (code && PAYOUT_EVENT_CODES.has(code)) {
        return {
            record: false,
            category: 'PAYPAL_PAYOUT',
            direction: 'USCITA',
            reason: `skip_payout_${code}`,
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

/**
 * Classificazione T-code per tabella gateway / quadratura (non Prima Nota).
 * Separa incassi, SaaS, payout, funding e rumore interno.
 */
export function classifyPaypalGatewayMovement(
    input: PaypalClassifyInput
): PaypalGatewayClassifyResult {
    const desc = (input.description || '').trim();
    const text = blob(input);
    const code = String(input.eventCode || '')
        .trim()
        .toUpperCase();
    const gross = input.grossCents;

    if (code && SKIP_EVENT_CODES.has(code)) {
        return {
            record: false,
            movementKind: 'skip',
            label: 'Movimento interno PayPal',
            isFunding: false,
            reason: `skip_event_${code}`,
        };
    }

    if (code && FUNDING_EVENT_CODES.has(code)) {
        return {
            record: false,
            movementKind: 'skip',
            label: 'Provvista / ricarica (giroconto)',
            isFunding: true,
            reason: `funding_${code}`,
        };
    }

    if (PAYPAL_FUNDING_LABEL_RE.test(text)) {
        return {
            record: false,
            movementKind: 'skip',
            label: 'Provvista / ricarica (giroconto)',
            isFunding: true,
            reason: 'funding_label',
        };
    }

    if (code && PAYOUT_EVENT_CODES.has(code)) {
        return {
            record: true,
            movementKind: 'payout',
            label: 'Payout Bancario',
            isFunding: false,
            reason: `payout_${code}`,
        };
    }

    if (INTERNAL_NET_RE.test(desc) || INTERNAL_NET_RE.test(text)) {
        return {
            record: false,
            movementKind: 'skip',
            label: 'Netto interno PayPal',
            isFunding: false,
            reason: 'skip_internal_net',
        };
    }

    if (/refund|rimborso|chargeback|storno/i.test(desc) || code === 'T1107' || code === 'T1106') {
        return {
            record: true,
            movementKind: 'rimborso',
            label: 'Rimborso',
            isFunding: false,
            reason: 'refund',
        };
    }

    if (/tariffa|fee|commissione/i.test(desc) && !/pagamento|payment|checkout/i.test(desc)) {
        return {
            record: true,
            movementKind: 'commissione',
            label: 'Commissione Gateway',
            isFunding: false,
            reason: 'fee_description',
        };
    }

    const isSaas = SAAS_MERCHANT_RE.test(text);

    if (gross < 0 && isSaas) {
        return {
            record: true,
            movementKind: 'altro',
            label: 'Spesa SaaS / Carta PayPal',
            isFunding: false,
            reason: 'saas_merchant',
        };
    }

    if (gross > 0 && isSaas) {
        return {
            record: true,
            movementKind: 'rimborso',
            label: 'Rimborso SaaS',
            isFunding: false,
            reason: 'saas_credit',
        };
    }

    if (code && ORDER_EVENT_CODES.has(code)) {
        return {
            record: true,
            movementKind: 'incasso',
            label: 'Incasso Ordine',
            isFunding: false,
            reason: `order_${code}`,
        };
    }

    if (code === 'T0000' && gross < 0) {
        return {
            record: true,
            movementKind: 'altro',
            label: 'Pagamento fornitore',
            isFunding: false,
            reason: 't0000_debit',
        };
    }

    if (gross >= 0) {
        return {
            record: true,
            movementKind: 'incasso',
            label: 'Incasso Ordine',
            isFunding: false,
            reason: code ? `payment_in_${code}` : 'payment_in',
        };
    }

    if (/trasferimento|withdrawal|payout|bonifico|user initiated|prelievo/i.test(desc)) {
        return {
            record: true,
            movementKind: 'payout',
            label: 'Payout Bancario',
            isFunding: false,
            reason: 'payout_description',
        };
    }

    return {
        record: true,
        movementKind: 'altro',
        label: 'Uscita PayPal',
        isFunding: false,
        reason: 'other_out',
    };
}
