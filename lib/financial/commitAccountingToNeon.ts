/**
 * Bridge AccountingEntry (cache JSON) → Registro Neon via cancello unico.
 * Usato da webhook Stripe, bank fee e processManualOrders (Fase pre-4).
 */

import {
    commitLedgerEntries,
    type LedgerCommitResult,
} from '@/lib/financial/ledgerWriteGate';
import type { LedgerEntryInput, LedgerCategory } from '@/lib/financial/historicalLedgerTypes';
import type { AccountingEntry } from '@/lib/financial/types';
import { VAT_PCT_FLORAL, VAT_PCT_ORDINARY } from '@/lib/financial/vat';

function inferCategory(entry: AccountingEntry): LedgerCategory {
    const dare = entry.dareAccount || '';
    const avere = entry.avereAccount || '';
    if (/60100|Ricavi/i.test(avere) || /60100|Ricavi/i.test(dare)) return 'RICAVI_VENDITE';
    if (/70200|Commissioni|Oneri bancari|Fee/i.test(dare)) return 'ONERI_BANCARI';
    if (/70800|Imposte/i.test(dare)) return 'IMPOSTE';
    if (/70300|SaaS/i.test(dare)) return 'SPESE_SAAS';
    if (/70100|Fiorist/i.test(dare)) return 'COSTI_FIORISTI';
    return 'SPESE_OPERATIVE';
}

function isRevenue(entry: AccountingEntry): boolean {
    return /60100|Ricavi/i.test(entry.avereAccount || '');
}

/**
 * Converte una riga CE locale in input cancello (sourceKey stabile = JSON_ENTRY:id).
 */
export function accountingEntryToLedgerInput(
    entry: AccountingEntry,
    overrides?: Partial<LedgerEntryInput>
): LedgerEntryInput {
    const revenue = isRevenue(entry);
    const abs = Math.abs(entry.amountCents);
    const vatAbs = Math.abs(entry.vatAmountCents || 0);
    const category = overrides?.category || inferCategory(entry);
    const signedTotal = revenue ? abs : -abs;
    const signedNet = revenue ? abs - vatAbs : -(abs - vatAbs);
    const signedVat = revenue ? vatAbs : vatAbs ? -vatAbs : 0;
    const vatRate =
        overrides?.vatRate ??
        (vatAbs > 0
            ? Math.abs(vatAbs / Math.max(1, abs - vatAbs) - 0.1) < 0.02
                ? VAT_PCT_FLORAL
                : VAT_PCT_ORDINARY
            : 0);

    const base: LedgerEntryInput = {
        sourceKey: `JSON_ENTRY:${entry.id}`.slice(0, 180),
        sourceType: 'JSON_ENTRY',
        sourceId: entry.id,
        direction: revenue ? 'ENTRATA' : 'USCITA',
        category,
        accountingDate: new Date(`${entry.date.slice(0, 10)}T12:00:00.000Z`),
        description: entry.description.slice(0, 2000),
        netCents: signedNet,
        vatRate,
        vatCents: signedVat,
        totalCents: signedTotal,
        reconciliationStatus: 'UNMATCHED',
        documentRef: entry.invoiceReference,
        entryNature: 'ECONOMICA',
        settlementStatus: 'NOT_APPLICABLE',
        metadataJson: {
            dareAccount: entry.dareAccount,
            avereAccount: entry.avereAccount,
            isForeignService: entry.isForeignService,
            fromAccountingEntry: true,
        },
    };
    if (!overrides) return base;
    return {
        ...base,
        ...overrides,
        sourceKey: (overrides.sourceKey || base.sourceKey).slice(0, 180),
        sourceType: overrides.sourceType || base.sourceType,
        sourceId: overrides.sourceId || base.sourceId,
        metadataJson: {
            ...(base.metadataJson || {}),
            ...(overrides.metadataJson || {}),
        },
    };
}

/** Commit idempotente (SKIP se già presente). */
export async function commitAccountingEntriesToNeon(
    entries: AccountingEntry[],
    mapOverrides?: (entry: AccountingEntry) => Partial<LedgerEntryInput> | undefined
): Promise<LedgerCommitResult> {
    const inputs = entries.map((e) =>
        accountingEntryToLedgerInput(e, mapOverrides?.(e))
    );
    return commitLedgerEntries(inputs);
}
