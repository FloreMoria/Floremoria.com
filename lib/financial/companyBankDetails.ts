/**
 * Coordinate bancarie ufficiali FloreMoria S.r.l. — conto corrente FinecoBank.
 * Fonte unica per Contabilità, Prima Nota e contesto Alberto CFO.
 */

export const FLOREMORIA_LEGAL_ENTITY = {
    legalName: 'FLOREMORIA S.R.L.',
    registeredOffice: 'VIA BELLINZONA 82/B, 22100 COMO (CO)',
    vatNumber: '04188260139',
    taxCode: '04188260139',
} as const;

export const FLOREMORIA_FINECO_BANK = {
    institute: 'FinecoBank S.p.A.',
    accountHolder: FLOREMORIA_LEGAL_ENTITY.legalName,
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
        `Intestatario: ${FLOREMORIA_FINECO_BANK.accountHolder}`,
        `Sede Legale: ${FLOREMORIA_LEGAL_ENTITY.registeredOffice}`,
        `P.IVA / C.F.: ${FLOREMORIA_LEGAL_ENTITY.vatNumber}`,
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
