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
    { code: '50100', name: 'Banca FinecoBank (cassa operativa)', nature: 'attivo' },
    { code: '50200', name: 'Cassa PayPal (wallet gateway)', nature: 'attivo' },
    { code: '17100', name: 'Conto transitorio Gateway (giroconto)', nature: 'attivo' },
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

/**
 * Incasso PayPal (evento primario CAPTURE / T0006): ricavo lordo + fee, netto su cassa PayPal.
 * Non usare per TRANSFER/WITHDRAWAL (vedi draftPaypalTransitGirocontoEntry).
 */
export function draftPaypalSaleEntry(params: {
    date: string;
    orderRef: string;
    grossCents: number;
    feeCents: number;
    netCents: number;
}): DoubleEntryDraft {
    const lines: DoubleEntryLine[] = [
        {
            accountCode: '50200',
            accountName: 'Cassa PayPal (wallet gateway)',
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
        description: `Incasso ordine ${params.orderRef} via PayPal`,
        date: params.date,
        lines,
        balanced: isBalanced(lines),
    };
}

/**
 * Giroconto PayPal: sweep / withdrawal / transfer / pareggio saldo (±netto).
 * Dare/avere solo tra cassa PayPal, transito gateway e banca — NON tocca 60100 né costi operativi.
 *
 * Esempio sweep wallet → banca:
 *   Dare 17100 Transito / Avere 50200 PayPal  (uscita wallet)
 *   Dare 50100 Fineco   / Avere 17100 Transito (accredito banca)
 */
export function draftPaypalTransitGirocontoEntry(params: {
    date: string;
    amountCents: number;
    direction: 'wallet_to_bank' | 'bank_to_wallet' | 'internal_balance';
    reference?: string;
}): DoubleEntryDraft {
    const amount = Math.abs(params.amountCents);
    const ref = params.reference ? ` ${params.reference}` : '';
    let lines: DoubleEntryLine[];
    let description: string;

    if (params.direction === 'wallet_to_bank') {
        description = `Giroconto PayPal → Fineco${ref}`;
        lines = [
            {
                accountCode: '17100',
                accountName: 'Conto transitorio Gateway (giroconto)',
                dareCents: amount,
                avereCents: 0,
            },
            {
                accountCode: '50200',
                accountName: 'Cassa PayPal (wallet gateway)',
                dareCents: 0,
                avereCents: amount,
            },
            {
                accountCode: '50100',
                accountName: 'Banca FinecoBank (cassa operativa)',
                dareCents: amount,
                avereCents: 0,
            },
            {
                accountCode: '17100',
                accountName: 'Conto transitorio Gateway (giroconto)',
                dareCents: 0,
                avereCents: amount,
            },
        ];
    } else if (params.direction === 'bank_to_wallet') {
        description = `Giroconto Fineco → PayPal (provvista)${ref}`;
        lines = [
            {
                accountCode: '17100',
                accountName: 'Conto transitorio Gateway (giroconto)',
                dareCents: amount,
                avereCents: 0,
            },
            {
                accountCode: '50100',
                accountName: 'Banca FinecoBank (cassa operativa)',
                dareCents: 0,
                avereCents: amount,
            },
            {
                accountCode: '50200',
                accountName: 'Cassa PayPal (wallet gateway)',
                dareCents: amount,
                avereCents: 0,
            },
            {
                accountCode: '17100',
                accountName: 'Conto transitorio Gateway (giroconto)',
                dareCents: 0,
                avereCents: amount,
            },
        ];
    } else {
        // Pareggio saldo interno (±netto speculare): non altera fatturato né costi
        description = `Giroconto interno PayPal (pareggio saldo)${ref}`;
        lines = [
            {
                accountCode: '17100',
                accountName: 'Conto transitorio Gateway (giroconto)',
                dareCents: amount,
                avereCents: 0,
            },
            {
                accountCode: '50200',
                accountName: 'Cassa PayPal (wallet gateway)',
                dareCents: 0,
                avereCents: amount,
            },
            {
                accountCode: '50200',
                accountName: 'Cassa PayPal (wallet gateway)',
                dareCents: amount,
                avereCents: 0,
            },
            {
                accountCode: '17100',
                accountName: 'Conto transitorio Gateway (giroconto)',
                dareCents: 0,
                avereCents: amount,
            },
        ];
    }

    return {
        description,
        date: params.date,
        lines,
        balanced: isBalanced(lines),
    };
}

/**
 * Riconosce movimenti PayPal da trattare come giroconto (non ricavo/costo).
 * Allineato a T2002/T5000/T5001 e label TRANSFER/WITHDRAWAL.
 */
export function isPaypalGirocontoMovement(params: {
    eventCode?: string | null;
    description?: string | null;
    grossCents?: number;
    feeCents?: number;
}): boolean {
    const code = String(params.eventCode || '')
        .trim()
        .toUpperCase();
    if (
        code === 'T2000' ||
        code === 'T2001' ||
        code === 'T2002' ||
        code === 'T2003' ||
        code === 'T0400' ||
        code === 'T0401' ||
        code === 'T0403' ||
        code === 'T5000' ||
        code === 'T5001' ||
        code === 'T0300' ||
        code === 'T0301' ||
        code === 'T0302'
    ) {
        return true;
    }
    const desc = String(params.description || '');
    if (
        /trasferimento|withdrawal|payout|bonifico|user initiated|prelievo|transfer|auto[\s-]?sweep|denaro raccolto|importo pagato/i.test(
            desc
        )
    ) {
        return true;
    }
    // Generico "PayPal {id}" senza fee = spesso ±netto speculare
    if (
        /^paypal\s+[A-Z0-9]+$/i.test(desc.trim()) &&
        (!params.feeCents || params.feeCents === 0)
    ) {
        return true;
    }
    return false;
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
