/**
 * Modulo 1 — Tax Advisor (xNunc-inspired).
 * IVA floreale 10% (DPR 633/72 Tab. A P. III), ordinaria 22%, IRES/IRAP, F24, reverse charge.
 * Valutazione preliminare — conferma professionista abilitato.
 */

import {
    scorporaIvaFloreale,
    scorporaIvaOrdinaria,
    scorporaVenditaFloreale,
    VAT_RATE_FLORAL,
    VAT_RATE_ORDINARY,
    type VatBreakdown,
} from '@/lib/financial/vat';

export const TAX_ADVISOR_SKILL_ID = 'tax_advisor' as const;

export const IRES_RATE = 0.24;
/** IRAP ordinaria imprese (indicativa — regioni possono differire). */
export const IRAP_RATE_INDICATIVE = 0.039;

export { VAT_RATE_FLORAL, VAT_RATE_ORDINARY };

export function scorporaIvaFlorealeDpr633(grossCents: number): VatBreakdown {
    return scorporaIvaFloreale(grossCents);
}

export function scorporaIvaOrdinaria22(grossCents: number): VatBreakdown {
    return scorporaIvaOrdinaria(grossCents);
}

export function scorporaVenditaMista(params: {
    grossCents: number;
    accessoryCents?: number;
}) {
    return scorporaVenditaFloreale(params);
}

/** Stima IRES su imponibile fiscale (semplificata). */
export function estimateIresCents(taxableIncomeCents: number): number {
    const base = Math.max(0, Math.round(taxableIncomeCents));
    return Math.round(base * IRES_RATE);
}

/** Stima IRAP su valore della produzione netta (semplificata). */
export function estimateIrapCents(
    productionValueCents: number,
    rate = IRAP_RATE_INDICATIVE
): number {
    const base = Math.max(0, Math.round(productionValueCents));
    return Math.round(base * rate);
}

/** Ritenuta d'acconto tipica su compensi (es. 20% su 100% o su 50% — da Verify). */
export function estimateWithholdingTaxCents(params: {
    grossCents: number;
    rate?: number;
    taxableShare?: number;
}): number {
    const rate = params.rate ?? 0.2;
    const share = params.taxableShare ?? 1;
    return Math.round(Math.max(0, params.grossCents) * share * rate);
}

export type F24Deadline = {
    code: string;
    label: string;
    indicativeDueDate: string;
    note: string;
};

export function buildF24DeadlineCalendar(year: number): F24Deadline[] {
    return [
        {
            code: 'IVA_T1',
            label: `Liquidazione IVA T1 ${year}`,
            indicativeDueDate: `${year}-05-16`,
            note: 'Verificare proroghe AdE / festività (Tier 1–2)',
        },
        {
            code: 'IVA_T2',
            label: `Liquidazione IVA T2 ${year}`,
            indicativeDueDate: `${year}-09-16`,
            note: 'Liquidazione IVA trimestrale',
        },
        {
            code: 'IVA_T3',
            label: `Liquidazione IVA T3 ${year}`,
            indicativeDueDate: `${year}-11-16`,
            note: 'Liquidazione IVA trimestrale',
        },
        {
            code: 'IVA_T4',
            label: `Liquidazione IVA T4 ${year} / acconto`,
            indicativeDueDate: `${year + 1}-03-16`,
            note: 'Acconto IVA — Verify disposizioni AdE anno',
        },
        {
            code: 'IRES_SALDO',
            label: `IRES saldo / acconto ${year}`,
            indicativeDueDate: `${year + 1}-06-30`,
            note: 'Scadenze REDDITI — Verify calendario ufficiale',
        },
    ];
}

export type DeductibilityRule = {
    category: string;
    typicallyDeductible: boolean | 'partial';
    note: string;
};

export function enterpriseCostDeductibilityRules(): DeductibilityRule[] {
    return [
        {
            category: 'Commissioni Stripe / gateway UE',
            typicallyDeductible: true,
            note: 'Costo deducibile; reverse charge IVA se fornitore UE senza stabile org.',
        },
        {
            category: 'Google / Meta Ads / SaaS estero',
            typicallyDeductible: true,
            note: 'Spesso reverse charge + esterometro — Verify prassi AdE',
        },
        {
            category: 'Compensi fioristi / costi produzione',
            typicallyDeductible: true,
            note: 'Tracciare fatture/ricevute passive partner',
        },
        {
            category: 'Omaggi / rappresentanza',
            typicallyDeductible: 'partial',
            note: 'Limiti di deducibilità — non generalizzare senza norma',
        },
    ];
}

export type ReverseChargeHint = {
    vendorPattern: string;
    likelyReverseCharge: boolean;
    note: string;
};

/** Trattamento indicativo fatture passive intracomunitarie / digitali. */
export function reverseChargeIntracomHints(): ReverseChargeHint[] {
    return [
        {
            vendorPattern: 'Stripe Payments Europe / fee gateway',
            likelyReverseCharge: true,
            note: 'Fee UE: tipico reverse charge; IVA non in fattura fornitore',
        },
        {
            vendorPattern: 'Google Ireland / Cloud / Workspace',
            likelyReverseCharge: true,
            note: 'Servizi digitali B2B UE — RC + integrazione IVA',
        },
        {
            vendorPattern: 'Meta Ireland Ads',
            likelyReverseCharge: true,
            note: 'Pubblicità UE — Verify regime e codice natura',
        },
        {
            vendorPattern: 'Fornitore IT con P.IVA italiana',
            likelyReverseCharge: false,
            note: 'Fattura ordinaria IT — IVA esposta dal fornitore',
        },
    ];
}

export const taxAdvisorSkillMeta = {
    id: TAX_ADVISOR_SKILL_ID,
    module: 1 as const,
    name: 'Tax Advisor',
    normativeRefs: [
        'DPR 633/72 Tab. A Parte III (IVA 10% floricoltura/omaggi)',
        'IVA ordinaria 22%',
        'TUIR — IRES 24%',
        'IRAP — aliquota regionale',
        'Reverse charge UE / AdE',
    ],
};
