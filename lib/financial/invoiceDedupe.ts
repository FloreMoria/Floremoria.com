/**
 * Normalizzazione P.IVA / chiave dedupe fatture passive.
 * Delega al normalizzatore unico (`canonicalDocumentKey`) — Fase 1.
 */

import {
    buildCanonicalDocumentKey,
    canonicalDocumentKeysMatch,
    normalizeCanonicalVat,
    normalizeDocDate,
    normalizeDocToken,
    normalizeDocType,
} from '@/lib/financial/canonicalDocumentKey';

export function normalizeVendorVat(raw: string | null | undefined): string | null {
    if (raw == null) return null;
    const v = normalizeCanonicalVat(raw);
    return v === 'NOVAT' ? null : v;
}

/**
 * @deprecated Preferire buildCanonicalDocumentKey con docType.
 * Wrapper legacy VAT|NUM|DATE → ora emette chiave canonica a 5 segmenti (recipient=*, tipo UNKNOWN se assente).
 */
export function buildInvoiceDedupeKey(
    vat: string | null | undefined,
    number: string,
    date: string,
    docType?: string | null,
    recipientVat?: string | null
): string {
    return buildCanonicalDocumentKey({
        recipientVat: recipientVat || null,
        supplierVat: vat,
        docType: docType || null,
        docNumber: number,
        docDate: date,
    });
}

/** Confronta chiavi canoniche e legacy (3 segmenti). */
export function dedupeKeysMatch(a: string, b: string): boolean {
    return canonicalDocumentKeysMatch(a, b);
}

export {
    buildCanonicalDocumentKey,
    canonicalDocumentKeysMatch,
    normalizeCanonicalVat,
    normalizeDocDate,
    normalizeDocToken,
    normalizeDocType,
};
