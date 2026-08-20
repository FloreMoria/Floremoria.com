/**
 * Normalizzazione P.IVA / chiave dedupe fatture passive.
 * Perché: YouDoox XLSX espone P.IVA senza prefisso IT, XML FatturaPA con IT → stessi documenti sembravano diversi o matchavano via substring errata.
 */

export function normalizeVendorVat(raw: string | null | undefined): string | null {
    if (raw == null) return null;
    let v = String(raw)
        .replace(/\s+/g, '')
        .replace(/^IT-/i, 'IT')
        .toUpperCase();
    if (!v) return null;
    // P.IVA italiana a 11 cifre senza paese → IT
    if (/^\d{11}$/.test(v)) return `IT${v}`;
    // già con paese (IT/IE/…) o CF alfanumerico
    return v;
}

export function buildInvoiceDedupeKey(
    vat: string | null | undefined,
    number: string,
    date: string
): string {
    const v = normalizeVendorVat(vat) || 'NOVAT';
    const n = String(number).replace(/\s+/g, '').toUpperCase();
    return `${v}|${n}|${date}`;
}

/** Confronta chiavi anche se una ha IT e l'altra no (legacy). */
export function dedupeKeysMatch(a: string, b: string): boolean {
    if (!a || !b) return false;
    if (a === b) return true;
    const partsA = a.split('|');
    const partsB = b.split('|');
    if (partsA.length < 3 || partsB.length < 3) return false;
    const [vatA, numA, dateA] = partsA;
    const [vatB, numB, dateB] = partsB;
    if (numA !== numB || dateA !== dateB) return false;
    const na = normalizeVendorVat(vatA) || vatA;
    const nb = normalizeVendorVat(vatB) || vatB;
    return na === nb;
}
