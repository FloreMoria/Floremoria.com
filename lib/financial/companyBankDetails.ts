/**
 * Coordinate bancarie ufficiali FloreMoria S.r.l. — conto corrente FinecoBank.
 * Fonte unica per Contabilità, Prima Nota e contesto Alberto CFO.
 */

export const FLOREMORIA_LEGAL_ENTITY = {
    /** Ragione sociale completa (UI Contabilità / documenti). */
    legalName: 'FloreMoria S.r.l. (Startup Innovativa)',
    /** Forma breve legacy / uppercase per bonifici e XML. */
    legalNameShort: 'FLOREMORIA S.R.L.',
    registeredOffice: 'Via Bellinzona 82/B, 22100 Como (CO)',
    vatNumber: '04188260139',
    taxCode: '04188260139',
    /** Numero REA Camera di Commercio di Como. */
    reaNumber: 'CO - 426383',
    /** Capitale sociale deliberato e versato. */
    shareCapital: '€ 11.410,00 i.v.',
    /** Codice Destinatario SDI (fatturazione elettronica). */
    sdiCode: 'K0ROACV',
} as const;

export const FLOREMORIA_FINECO_BANK = {
    institute: 'FinecoBank S.p.A.',
    accountHolder: FLOREMORIA_LEGAL_ENTITY.legalNameShort,
    /** IBAN con spazi di presentazione. */
    ibanDisplay: 'IT95 F 03015 03200 000004331813',
    /** IBAN compatto (bonifici / validazione). */
    iban: 'IT95F0301503200000004331813',
    bicSepa: 'FEBIITM1',
    bicSwift: 'FEBIITM2',
} as const;

/** Conto contabile disponibilità liquide (Piano dei Conti interno). */
export const LEDGER_BANK_ACCOUNT = '50100 - Banca FinecoBank' as const;

export function formatFloremoriaBankBlock(): string {
    return [
        `Ragione Sociale: ${FLOREMORIA_LEGAL_ENTITY.legalName}`,
        `Sede Legale: ${FLOREMORIA_LEGAL_ENTITY.registeredOffice}`,
        `P.IVA / C.F.: ${FLOREMORIA_LEGAL_ENTITY.vatNumber}`,
        `REA: ${FLOREMORIA_LEGAL_ENTITY.reaNumber}`,
        `Capitale Sociale: ${FLOREMORIA_LEGAL_ENTITY.shareCapital}`,
        `Codice SDI: ${FLOREMORIA_LEGAL_ENTITY.sdiCode}`,
        `Istituto: ${FLOREMORIA_FINECO_BANK.institute}`,
        `IBAN: ${FLOREMORIA_FINECO_BANK.ibanDisplay}`,
        `BIC/SWIFT: ${FLOREMORIA_FINECO_BANK.bicSepa} (SEPA) / ${FLOREMORIA_FINECO_BANK.bicSwift} (SWIFT)`,
    ].join('\n');
}

/** Blocco breve per system prompt Alberto CFO. */
export function buildAlbertoBankContextPrompt(): string {
    return `
COORDINATE BANCARIE AZIENDALI (conto operativo FloreMoria — FinecoBank, NON altri istituti):
${formatFloremoriaBankBlock()}
- In Prima Nota il conto disponibilità liquide è: ${LEDGER_BANK_ACCOUNT}.
- I payout Stripe/PayPal accreditano questo IBAN Fineco.
`.trim();
}
