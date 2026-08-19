/**
 * Modulo 2 — Accounting.
 * Partita doppia, piano conti CEE e-commerce/digital, ratei/risconti, cassa vs competenza.
 */

export const ACCOUNTING_SKILL_ID = 'accounting' as const;

export type DoubleEntryLine = {
    accountCode: string;
    accountName: string;
    dareCents: number;
    avereCents: number;
};

export type DoubleEntryDraft = {
    description: string;
    date: string;
    lines: DoubleEntryLine[];
    balanced: boolean;
};

/** Piano conti sintetico CEE / e-commerce FloreMoria. */
export const CEE_CHART_OF_ACCOUNTS = [
    { code: '50100', name: 'Banca / Cassa operativa', nature: 'attivo' },
    { code: '60100', name: 'Ricavi da vendite (corrispettivi)', nature: 'ricavo' },
    { code: '70100', name: 'Costi produzione fioristi partner', nature: 'costo' },
    { code: '70200', name: 'Commissioni gateway (Stripe/PayPal)', nature: 'costo' },
    { code: '70300', name: 'Software SaaS / servizi digitali estero', nature: 'costo' },
    { code: '70400', name: 'Pubblicità e marketing', nature: 'costo' },
    { code: '26000', name: 'IVA a debito', nature: 'passivo' },
    { code: '16000', name: 'IVA a credito', nature: 'attivo' },
    { code: '18000', name: 'Crediti vs clienti', nature: 'attivo' },
    { code: '28000', name: 'Debiti vs fornitori', nature: 'passivo' },
    { code: '12000', name: 'Immobilizzazioni / cespiti', nature: 'attivo' },
    { code: '12100', name: 'Fondo ammortamento', nature: 'passivo' },
] as const;

function isBalanced(lines: DoubleEntryLine[]): boolean {
    const dare = lines.reduce((s, l) => s + l.dareCents, 0);
    const avere = lines.reduce((s, l) => s + l.avereCents, 0);
    return dare === avere;
}

/** Incasso Stripe lordo + fee: ricavo + costo commissioni. */
export function draftStripeSaleEntry(params: {
    date: string;
    orderRef: string;
    grossCents: number;
    feeCents: number;
    netCents: number;
}): DoubleEntryDraft {
    const lines: DoubleEntryLine[] = [
        {
            accountCode: '50100',
            accountName: 'Banca / Cassa operativa',
            dareCents: params.netCents,
            avereCents: 0,
        },
        {
            accountCode: '70200',
            accountName: 'Commissioni gateway',
            dareCents: params.feeCents,
            avereCents: 0,
        },
        {
            accountCode: '60100',
            accountName: 'Ricavi da vendite',
            dareCents: 0,
            avereCents: params.grossCents,
        },
    ];
    return {
        description: `Incasso ordine ${params.orderRef} via Stripe`,
        date: params.date,
        lines,
        balanced: isBalanced(lines),
    };
}

/** Pagamento fornitore / fiorista. */
export function draftPartnerPayoutEntry(params: {
    date: string;
    partnerRef: string;
    amountCents: number;
}): DoubleEntryDraft {
    const lines: DoubleEntryLine[] = [
        {
            accountCode: '70100',
            accountName: 'Costi produzione fioristi',
            dareCents: params.amountCents,
            avereCents: 0,
        },
        {
            accountCode: '50100',
            accountName: 'Banca / Cassa operativa',
            dareCents: 0,
            avereCents: params.amountCents,
        },
    ];
    return {
        description: `Liquidazione partner ${params.partnerRef}`,
        date: params.date,
        lines,
        balanced: isBalanced(lines),
    };
}

export type AccrualAdjustment = {
    type: 'rateo_attivo' | 'rateo_passivo' | 'risconto_attivo' | 'risconto_passivo' | 'ammortamento';
    description: string;
    amountCents: number;
    competenceNote: string;
};

/** Rateo: competenza già maturata, incasso/pagamento futuro. */
export function buildRateo(params: {
    side: 'attivo' | 'passivo';
    amountCents: number;
    description: string;
}): AccrualAdjustment {
    return {
        type: params.side === 'attivo' ? 'rateo_attivo' : 'rateo_passivo',
        description: params.description,
        amountCents: Math.round(params.amountCents),
        competenceNote:
            'Competenza economica già maturata — movimento di cassa in esercizio successivo',
    };
}

/** Risconto: pagamento/incasso già avvenuto, competenza futura. */
export function buildRisconto(params: {
    side: 'attivo' | 'passivo';
    amountCents: number;
    description: string;
}): AccrualAdjustment {
    return {
        type: params.side === 'attivo' ? 'risconto_attivo' : 'risconto_passivo',
        description: params.description,
        amountCents: Math.round(params.amountCents),
        competenceNote:
            'Cassa già movimentata — quota di competenza da rinviare all’esercizio successivo',
    };
}

/** Ammortamento lineare cespite. */
export function straightLineDepreciationCents(params: {
    assetCostCents: number;
    usefulLifeYears: number;
    residualValueCents?: number;
}): number {
    const life = Math.max(1, params.usefulLifeYears);
    const depreciable =
        Math.max(0, params.assetCostCents) - Math.max(0, params.residualValueCents ?? 0);
    return Math.round(depreciable / life);
}

export type CashVsCompetence = {
    cashBasisCents: number;
    competenceBasisCents: number;
    deltaCents: number;
    note: string;
};

/** Distinzione rigida cassa vs competenza su un periodo. */
export function compareCashVsCompetence(params: {
    cashInCents: number;
    cashOutCents: number;
    revenuesCompetenceCents: number;
    costsCompetenceCents: number;
}): CashVsCompetence {
    const cash = params.cashInCents - params.cashOutCents;
    const competence = params.revenuesCompetenceCents - params.costsCompetenceCents;
    return {
        cashBasisCents: cash,
        competenceBasisCents: competence,
        deltaCents: competence - cash,
        note: 'Non confondere surplus di cassa con utile di competenza (e viceversa).',
    };
}

export const accountingSkillMeta = {
    id: ACCOUNTING_SKILL_ID,
    module: 2 as const,
    name: 'Accounting',
    normativeRefs: ['Codice Civile artt. 2423 ss.', 'Principi OIC', 'Piano dei conti CEE'],
};
