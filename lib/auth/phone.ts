/**
 * Normalizzazione telefonica "ferrea" per il login/OTP.
 *
 * Assunzione di dominio: FloreMoria opera in Italia → prefisso paese di default +39.
 * Il DB può contenere numeri salvati in formati eterogenei (E.164 da Stripe, formato
 * nazionale dal checkout, con/senza +39, con prefisso `whatsapp:` da Twilio).
 * Per non escludere clienti reali confrontiamo tramite più varianti canoniche.
 */

const DEFAULT_COUNTRY_PREFIX = '39';

/** Estrae le sole cifre da una stringa telefonica (toglie spazi, trattini, parentesi, punti, +). */
export function digitsOnly(raw: string): string {
    return (raw || '').replace(/\D/g, '');
}

/**
 * Ricava il numero "nazionale" (senza prefisso internazionale).
 * Gestisce 00 e 39 come prefissi paese, evitando di intaccare numeri nazionali
 * di 10 cifre che iniziano per 39 (prefissi mobili validi, es. 393...).
 */
function toNationalNumber(raw: string): string {
    let n = digitsOnly(raw);
    if (n.startsWith('00')) n = n.slice(2);
    if (n.length > 10 && n.startsWith(DEFAULT_COUNTRY_PREFIX)) {
        n = n.slice(DEFAULT_COUNTRY_PREFIX.length);
    }
    return n;
}

/** Forma canonica E.164 italiana: +39 + numero nazionale. */
export function toE164(raw: string): string {
    const national = toNationalNumber(raw);
    if (!national) return '';
    return `+${DEFAULT_COUNTRY_PREFIX}${national}`;
}

/**
 * Insieme di varianti plausibili con cui un numero può essere salvato a DB.
 * Usato per un confronto esatto multiplo (OR) che copre i casi reali:
 *   input "3204105305"  ↔ DB "+393204105305" / "393204105305" / "3204105305".
 */
export function phoneVariants(raw: string): string[] {
    const national = toNationalNumber(raw);
    if (!national) return [];

    const e164 = `+${DEFAULT_COUNTRY_PREFIX}${national}`;
    const variants = new Set<string>([
        e164, // +393204105305
        `${DEFAULT_COUNTRY_PREFIX}${national}`, // 393204105305
        national, // 3204105305
        `whatsapp:${e164}`, // whatsapp:+393204105305 (Twilio)
        digitsOnly(raw), // cifre grezze così come digitate
        (raw || '').trim(), // valore esatto inserito
    ]);

    return Array.from(variants).filter(Boolean);
}

/** Numero significativo nazionale (ultime 9 cifre) per un confronto "contains" di riserva. */
export function phoneCore(raw: string): string {
    const national = toNationalNumber(raw);
    return national.length >= 9 ? national.slice(-9) : national;
}
