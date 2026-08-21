/**
 * Normalizzazione telefonica per login/OTP e contatti.
 *
 * Supporta prefissi internazionali esteri (+1, +44, +49, +33, +34, +41, +43, +32, +31, +351, +40, ecc.).
 * Se il numero inserito inizia già con un prefisso internazionale (con +, 00 o prefisso paese estero noto),
 * NON antepone mai +39 e ne preserva il formato originale.
 */

const DEFAULT_COUNTRY_PREFIX = '39';

// Prefissi paesi esteri principali (.eu, america, asia, ecc.)
const KNOWN_INTL_PREFIXES = [
    '1', '44', '49', '33', '34', '41', '43', '32', '31', '351', '352', '353', '358',
    '386', '420', '421', '45', '46', '47', '30', '36', '40', '48', '380', '55', '52', '61', '86'
];

/** Estrae le sole cifre da una stringa telefonica (toglie spazi, trattini, parentesi, punti, +). */
export function digitsOnly(raw: string): string {
    return (raw || '').replace(/\D/g, '');
}

/** Verifica se una stringa o numero inserito rappresenta un numero estero. */
export function isInternationalNumber(raw: string): boolean {
    const trimmed = (raw || '').trim();
    if (!trimmed) return false;
    if (trimmed.startsWith('+') && !trimmed.startsWith('+39')) return true;
    if (trimmed.startsWith('00') && !trimmed.startsWith('0039')) return true;

    const digits = digitsOnly(trimmed);
    for (const prefix of KNOWN_INTL_PREFIXES) {
        if (digits.startsWith(prefix) && digits.length > 8) {
            return true;
        }
    }
    return false;
}

/**
 * Ricava il numero nazionale o la sequenza cifre internazionale senza prefisso paese se italiano.
 */
function toNationalNumber(raw: string): string {
    let n = digitsOnly(raw);
    if (n.startsWith('00')) n = n.slice(2);
    if (n.length > 10 && n.startsWith(DEFAULT_COUNTRY_PREFIX)) {
        n = n.slice(DEFAULT_COUNTRY_PREFIX.length);
    }
    return n;
}

/** Forma canonica E.164 (preserva prefisso estero se presente). */
export function toE164(raw: string): string {
    const trimmed = (raw || '').trim();
    if (!trimmed) return '';

    if (isInternationalNumber(trimmed)) {
        let digits = digitsOnly(trimmed);
        if (digits.startsWith('00')) digits = digits.slice(2);
        return `+${digits}`;
    }

    const national = toNationalNumber(raw);
    if (!national) return '';
    return `+${DEFAULT_COUNTRY_PREFIX}${national}`;
}

/**
 * Insieme di varianti plausibili con cui un numero può essere salvato a DB.
 */
export function phoneVariants(raw: string): string[] {
    const trimmed = (raw || '').trim();
    if (!trimmed) return [];

    if (isInternationalNumber(trimmed)) {
        const e164 = toE164(trimmed);
        const digits = digitsOnly(trimmed);
        const variants = new Set<string>([
            e164,
            digits,
            `whatsapp:${e164}`,
            trimmed,
        ]);
        return Array.from(variants).filter(Boolean);
    }

    const national = toNationalNumber(raw);
    if (!national) return [];

    const e164 = `+${DEFAULT_COUNTRY_PREFIX}${national}`;
    const variants = new Set<string>([
        e164, // +393204105305
        `${DEFAULT_COUNTRY_PREFIX}${national}`, // 393204105305
        national, // 3204105305
        `whatsapp:${e164}`, // whatsapp:+393204105305 (Twilio)
        digitsOnly(raw), // cifre grezze così come digitate
        trimmed, // valore esatto inserito
    ]);

    return Array.from(variants).filter(Boolean);
}

/** Numero significativo nazionale per un confronto "contains" di riserva. */
export function phoneCore(raw: string): string {
    const digits = digitsOnly(raw);
    if (isInternationalNumber(raw)) {
        return digits.length >= 8 ? digits.slice(-8) : digits;
    }
    const national = toNationalNumber(raw);
    return national.length >= 9 ? national.slice(-9) : national;
}

