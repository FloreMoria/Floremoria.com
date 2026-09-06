/**
 * Inserimento idempotente documenti passivi (Fase 3).
 * Chiave canonica + quarantena identità deboli.
 */

import prisma from '@/lib/prisma';
import {
    buildCanonicalDocumentKey,
    resolveVerificationStatusFromKey,
    type CanonicalDocumentKeyInput,
    type DocumentVerificationStatus,
} from '@/lib/financial/canonicalDocumentKey';

export function buildPassiveCanonicalKey(input: CanonicalDocumentKeyInput): {
    key: string;
    verificationStatus: DocumentVerificationStatus;
    /** Solo chiavi forti vanno in colonna UNIQUE; le deboli restano in metadata. */
    storeableCanonicalDocKey: string | null;
} {
    const key = buildCanonicalDocumentKey(input);
    const verificationStatus = resolveVerificationStatusFromKey(key);
    return {
        key,
        verificationStatus,
        storeableCanonicalDocKey: verificationStatus === 'CERTIFIED' ? key : null,
    };
}

export async function findManualExpenseByCanonicalKey(canonicalDocKey: string) {
    return prisma.manualFinanceExpense.findFirst({
        where: {
            OR: [
                { canonicalDocKey },
                { metadataJson: { path: ['dedupeKey'], equals: canonicalDocKey } },
            ],
            NOT: { verificationStatus: 'REJECTED' },
        },
    });
}

export async function findSaasInvoiceByCanonicalKey(canonicalDocKey: string) {
    return prisma.saasForeignInvoice.findFirst({
        where: {
            OR: [{ canonicalDocKey }, { notes: { contains: canonicalDocKey } }],
            NOT: { verificationStatus: 'REJECTED' },
        },
    });
}

/** True se escluso dai totali fiscali (quarantena / rejected). Legacy NULL = incluso. */
export function isExcludedFromFiscalTotals(
    verificationStatus: string | null | undefined
): boolean {
    return verificationStatus === 'QUARANTINE' || verificationStatus === 'REJECTED';
}
