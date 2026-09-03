/**
 * Catalogo e filtro pagamenti PayPal verso fornitori esteri (TD17/TD18).
 * Perché: in Prima Nota restano uscite miste; il commercialista deve vedere
 * solo SaaS/extra-UE-UE, non fioristi italiani già coperti da SDI.
 */

import {
    classifyPaypalEvent,
    paypalSignedCents,
    paypalTxnId,
    type PaypalMachineEntry,
} from '@/lib/accounting/paypalStateMachine';
import { SAAS_MERCHANT_RE } from '@/lib/financial/paypalClassify';
import { SAAS_FOREIGN_VENDOR_RE } from '@/lib/financial/foreignAutofattura';

export type PaypalForeignDocType = 'TD17' | 'TD18';
export type PaypalForeignJurisdiction = 'UE' | 'EXTRA_UE';
export type PaypalForeignDocStatus = 'ATTACHED' | 'MISSING';

export type PaypalForeignVendorProfile = {
    token: string;
    displayName: string;
    jurisdiction: PaypalForeignJurisdiction;
    docType: PaypalForeignDocType;
    natureLabel: string;
};

/** Fornitori IT già in fattura SDI / anagrafica nazionale — fuori dal rendiconto estero. */
export const ITALIAN_PAYPAL_VENDOR_RE =
    /\b(BALLARATE|ORCHIDEA|DONGO|FIORIST|FIORAI|ONORANZ|FUNEBR|CIMITER|TORRE\s+SRL|P\.?\s*IVA\s*IT|\bIT\d{11}\b)\b/i;

const FOREIGN_VENDOR_PROFILES: PaypalForeignVendorProfile[] = [
    {
        token: 'CURSOR',
        displayName: 'Cursor - Anysphere Inc.',
        jurisdiction: 'EXTRA_UE',
        docType: 'TD17',
        natureLabel: 'TD17 - Servizi Extra-UE',
    },
    {
        token: 'ANYSPHERE',
        displayName: 'Cursor - Anysphere Inc.',
        jurisdiction: 'EXTRA_UE',
        docType: 'TD17',
        natureLabel: 'TD17 - Servizi Extra-UE',
    },
    {
        token: 'ANYSILENT',
        displayName: 'Cursor - Anysphere Inc.',
        jurisdiction: 'EXTRA_UE',
        docType: 'TD17',
        natureLabel: 'TD17 - Servizi Extra-UE',
    },
    {
        token: 'VERCEL',
        displayName: 'Vercel Inc.',
        jurisdiction: 'EXTRA_UE',
        docType: 'TD17',
        natureLabel: 'TD17 - Servizi Extra-UE',
    },
    {
        token: 'TRANSATEL',
        displayName: 'Transatel Ubigi',
        jurisdiction: 'UE',
        docType: 'TD17',
        natureLabel: 'TD17 - Servizi UE',
    },
    {
        token: 'UBIGI',
        displayName: 'Transatel Ubigi',
        jurisdiction: 'UE',
        docType: 'TD17',
        natureLabel: 'TD17 - Servizi UE',
    },
    {
        token: 'GOOGLE',
        displayName: 'Google Ireland Ltd',
        jurisdiction: 'UE',
        docType: 'TD17',
        natureLabel: 'TD17 - Servizi UE',
    },
    {
        token: 'META',
        displayName: 'Meta Platforms Ireland Ltd',
        jurisdiction: 'UE',
        docType: 'TD17',
        natureLabel: 'TD17 - Servizi UE',
    },
    {
        token: 'FACEBOOK',
        displayName: 'Meta Platforms Ireland Ltd',
        jurisdiction: 'UE',
        docType: 'TD17',
        natureLabel: 'TD17 - Servizi UE',
    },
    {
        token: 'OPENAI',
        displayName: 'OpenAI Ireland Ltd',
        jurisdiction: 'UE',
        docType: 'TD17',
        natureLabel: 'TD17 - Servizi UE',
    },
    {
        token: 'CHATGPT',
        displayName: 'OpenAI Ireland Ltd',
        jurisdiction: 'UE',
        docType: 'TD17',
        natureLabel: 'TD17 - Servizi UE',
    },
    {
        token: 'GITHUB',
        displayName: 'GitHub Inc.',
        jurisdiction: 'EXTRA_UE',
        docType: 'TD17',
        natureLabel: 'TD17 - Servizi Extra-UE',
    },
    {
        token: 'DIGITALOCEAN',
        displayName: 'DigitalOcean LLC',
        jurisdiction: 'EXTRA_UE',
        docType: 'TD17',
        natureLabel: 'TD17 - Servizi Extra-UE',
    },
    {
        token: 'ANTHROPIC',
        displayName: 'Anthropic PBC',
        jurisdiction: 'EXTRA_UE',
        docType: 'TD17',
        natureLabel: 'TD17 - Servizi Extra-UE',
    },
    {
        token: 'CLAUDE',
        displayName: 'Anthropic PBC',
        jurisdiction: 'EXTRA_UE',
        docType: 'TD17',
        natureLabel: 'TD17 - Servizi Extra-UE',
    },
    {
        token: 'TWILIO',
        displayName: 'Twilio Inc.',
        jurisdiction: 'EXTRA_UE',
        docType: 'TD17',
        natureLabel: 'TD17 - Servizi Extra-UE',
    },
    {
        token: 'CLOUDFLARE',
        displayName: 'Cloudflare Inc.',
        jurisdiction: 'EXTRA_UE',
        docType: 'TD17',
        natureLabel: 'TD17 - Servizi Extra-UE',
    },
    {
        token: 'MICROSOFT',
        displayName: 'Microsoft Ireland',
        jurisdiction: 'UE',
        docType: 'TD17',
        natureLabel: 'TD17 - Servizi UE',
    },
    {
        token: 'ADOBE',
        displayName: 'Adobe Systems',
        jurisdiction: 'EXTRA_UE',
        docType: 'TD17',
        natureLabel: 'TD17 - Servizi Extra-UE',
    },
    {
        token: 'APPLE',
        displayName: 'Apple Distribution International',
        jurisdiction: 'UE',
        docType: 'TD17',
        natureLabel: 'TD17 - Servizi UE',
    },
    {
        token: 'STRIPE',
        displayName: 'Stripe Payments Europe',
        jurisdiction: 'UE',
        docType: 'TD17',
        natureLabel: 'TD17 - Servizi UE',
    },
];

function blobOf(row: PaypalMachineEntry): string {
    const meta =
        row.metadataJson && typeof row.metadataJson === 'object'
            ? (row.metadataJson as Record<string, unknown>)
            : {};
    return [row.counterpartyName, row.description, meta.typeLabel, meta.payerEmail]
        .filter((v) => typeof v === 'string')
        .join(' ');
}

export function matchPaypalForeignVendorProfile(
    row: PaypalMachineEntry
): PaypalForeignVendorProfile | null {
    const blob = blobOf(row).toUpperCase();
    for (const profile of FOREIGN_VENDOR_PROFILES) {
        if (blob.includes(profile.token)) return profile;
    }
    return null;
}

export function isItalianDomesticPaypalVendor(row: PaypalMachineEntry): boolean {
    return ITALIAN_PAYPAL_VENDOR_RE.test(blobOf(row));
}

/**
 * Uscita commerciale PayPal verso fornitore estero (post state machine).
 * Esclude transito carta, fee, payout Fineco, incassi cliente, fioristi IT.
 */
export function isPaypalForeignSupplierOutflow(row: PaypalMachineEntry): boolean {
    if (row.sourceType !== 'PAYPAL_MOVEMENT' && !(row.sourceKey || '').toUpperCase().startsWith('PAYPAL_')) {
        return false;
    }
    const kind = classifyPaypalEvent(row);
    if (kind === 'FEE' || kind === 'PAYOUT' || kind === 'ORDER_CAPTURE' || kind === 'FUNDING_TRANSIT') {
        return false;
    }
    if (isItalianDomesticPaypalVendor(row)) return false;

    const profile = matchPaypalForeignVendorProfile(row);
    const signed = paypalSignedCents(row);

    // Rimborso parziale sullo stesso fornitore estero: entra nel netto del trimestre
    if (kind === 'TECHNICAL_REVERSAL') {
        return Boolean(profile) && signed > 0;
    }
    if (signed >= 0) return false;
    if (profile) return true;
    if (kind !== 'COMMERCIAL_PAYMENT' && row.category !== 'SPESE_SAAS') return false;
    const blob = blobOf(row);
    return SAAS_MERCHANT_RE.test(blob) || SAAS_FOREIGN_VENDOR_RE.test(blob);
}

export function suggestPaypalForeignNature(row: PaypalMachineEntry): {
    profile: PaypalForeignVendorProfile;
    displayName: string;
} {
    const profile =
        matchPaypalForeignVendorProfile(row) ||
        ({
            token: 'ESTERO',
            displayName: (row.counterpartyName || 'Fornitore estero').trim() || 'Fornitore estero',
            jurisdiction: 'EXTRA_UE' as const,
            docType: 'TD17' as const,
            natureLabel: 'TD17 - Servizi Extra-UE',
        } satisfies PaypalForeignVendorProfile);
    return {
        profile,
        displayName: profile.displayName,
    };
}

export function paypalForeignTxnRef(row: PaypalMachineEntry): string {
    return paypalTxnId(row) || String(row.documentRef || row.sourceId || '').trim();
}

export function vendorMatchTokens(name: string): string[] {
    return name
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .split(/[^A-Z0-9]+/)
        .filter((t) => t.length > 3);
}

export function vendorsLikelyMatch(a: string, b: string): boolean {
    const ta = vendorMatchTokens(a);
    const tb = vendorMatchTokens(b);
    if (!ta.length || !tb.length) return false;
    return ta.some((t) => tb.includes(t));
}
