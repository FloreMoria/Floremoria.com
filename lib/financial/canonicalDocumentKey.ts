/**
 * Chiave canonica documento passivo (Fase 1 — rubinetti / dedupe).
 * Unica fonte di verità per P.IVA + tipo + numero + data.
 */

export type CanonicalDocumentKeyInput = {
    recipientVat?: string | null;
    supplierCountry?: string | null;
    supplierVat?: string | null;
    docType?: string | null;
    docNumber?: string | null;
    docDate?: string | null;
};

/** Trim + uppercase; spazi interni rimossi; zeri e separatori (/ - .) preservati. */
export function normalizeDocToken(raw: string | null | undefined): string {
    return String(raw ?? '')
        .trim()
        .replace(/\s+/g, '')
        .toUpperCase();
}

/**
 * Normalizza P.IVA / IdFiscale con prefisso paese.
 * Default IT per 11 cifre numeriche; `supplierCountry` usato se la partita è solo numerica.
 */
export function normalizeCanonicalVat(
    raw: string | null | undefined,
    countryHint?: string | null
): string {
    let v = normalizeDocToken(raw);
    if (!v) return 'NOVAT';
    v = v.replace(/^IT-/i, 'IT');

    const hint = normalizeDocToken(countryHint).slice(0, 2);
    if (/^\d{8,12}$/.test(v) && hint && /^[A-Z]{2}$/.test(hint)) {
        v = `${hint}${v}`;
    }
    if (/^\d{11}$/.test(v)) return `IT${v}`;
    return v;
}

/** Tipo documento SDI / FatturaPA (TD01, TD17, FPR01, …). */
export function normalizeDocType(raw: string | null | undefined): string {
    const t = normalizeDocToken(raw);
    if (!t) return 'UNKNOWN';
    // Alias comuni → codice canonico
    if (/^TD0?4$|NOTA.?CREDITO|^NC$/.test(t)) return 'TD04';
    if (/^TD17$/.test(t)) return 'TD17';
    if (/^TD18$/.test(t)) return 'TD18';
    if (/^TD19$/.test(t)) return 'TD19';
    if (/^FPR12$|^FPR01$|^FPR$/.test(t)) return t.startsWith('FPR') ? t : 'FPR01';
    if (/^TD01$|^FATTURA$/.test(t)) return t === 'FATTURA' ? 'TD01' : 'TD01';
    return t.slice(0, 32);
}

/** Data documento → YYYY-MM-DD se riconoscibile. */
export function normalizeDocDate(raw: string | null | undefined): string {
    const s = String(raw ?? '').trim();
    if (!s) return 'NODATE';
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const it = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
    if (it) {
        const d = Number(it[1]);
        const m = Number(it[2]);
        let y = Number(it[3]);
        if (y < 100) y += 2000;
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    return normalizeDocToken(s).slice(0, 32) || 'NODATE';
}

/**
 * Chiave canonica:
 *   recipientVat|supplierVat|docType|docNumber|docDate
 * Recipient assente → `*` (documento passivo generico verso FloreMoria).
 */
export function buildCanonicalDocumentKey(input: CanonicalDocumentKeyInput): string {
    const recipient = input.recipientVat
        ? normalizeCanonicalVat(input.recipientVat)
        : '*';
    const supplier = normalizeCanonicalVat(input.supplierVat, input.supplierCountry);
    const docType = normalizeDocType(input.docType);
    const docNumber = normalizeDocToken(input.docNumber) || 'NONUM';
    const docDate = normalizeDocDate(input.docDate);
    return `${recipient}|${supplier}|${docType}|${docNumber}|${docDate}`;
}

export type DocumentVerificationStatus = 'CERTIFIED' | 'QUARANTINE' | 'REJECTED';

/**
 * Chiave “forte” = P.IVA fornitore presente (non NOVAT) + numero documento + data.
 * Solo CF / NOVAT / NONUM / NODATE → quarantena.
 */
export function isStrongCanonicalDocumentKey(key: string | null | undefined): boolean {
    if (!key) return false;
    const parts = key.split('|');
    if (parts.length < 5) return false;
    const supplier = parts[1] || '';
    const docNumber = parts[3] || '';
    const docDate = parts[4] || '';
    if (!supplier || supplier === 'NOVAT') return false;
    // Solo codice fiscale italiano (16 alfanumerici) senza P.IVA → debole
    if (/^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/i.test(supplier.replace(/^IT/, ''))) {
        return false;
    }
    if (!docNumber || docNumber === 'NONUM') return false;
    if (!docDate || docDate === 'NODATE') return false;
    return true;
}

export function resolveVerificationStatusFromKey(
    key: string | null | undefined
): DocumentVerificationStatus {
    return isStrongCanonicalDocumentKey(key) ? 'CERTIFIED' : 'QUARANTINE';
}

/**
 * Compatibilità chiavi legacy a 3 segmenti (VAT|NUM|DATE) e nuove a 5.
 * Match se stesso fornitore + numero + data (tipo documento soft se assente da un lato).
 */
export function canonicalDocumentKeysMatch(a: string, b: string): boolean {
    if (!a || !b) return false;
    if (a === b) return true;

    const pa = a.split('|');
    const pb = b.split('|');

    const norm = (parts: string[]) => {
        if (parts.length >= 5) {
            return {
                recipient: parts[0] === '*' ? null : normalizeCanonicalVat(parts[0]),
                supplier: normalizeCanonicalVat(parts[1]),
                docType: normalizeDocType(parts[2]),
                number: normalizeDocToken(parts[3]),
                date: normalizeDocDate(parts[4]),
            };
        }
        // Legacy: VAT|NUMBER|DATE
        if (parts.length >= 3) {
            return {
                recipient: null as string | null,
                supplier: normalizeCanonicalVat(parts[0]),
                docType: null as string | null,
                number: normalizeDocToken(parts[1]),
                date: normalizeDocDate(parts[2]),
            };
        }
        return null;
    };

    const na = norm(pa);
    const nb = norm(pb);
    if (!na || !nb) return false;
    if (na.supplier !== nb.supplier) return false;
    if (na.number !== nb.number) return false;
    if (na.date !== nb.date) return false;
    if (na.docType && nb.docType && na.docType !== nb.docType && na.docType !== 'UNKNOWN' && nb.docType !== 'UNKNOWN') {
        return false;
    }
    if (na.recipient && nb.recipient && na.recipient !== nb.recipient) return false;
    return true;
}
