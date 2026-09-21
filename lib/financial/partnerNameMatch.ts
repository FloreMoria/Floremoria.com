/**
 * Shared name-matching for partner ↔ bank/invoice attribution.
 * Principle: never attribute on generic tokens alone; unmatched stays unmatched.
 */
export const PARTNER_NAME_GENERIC_TOKENS = new Set([
    'STUDIO',
    'FLOWERS',
    'FLOWER',
    'FIORI',
    'FIORE',
    'FIORERIA',
    'FLORERIA',
    'GARDEN',
    'FLORA',
    'FLORAL',
    'SRL',
    'SNC',
    'SAS',
    'SPA',
    'DI',
    'DELLA',
    'DELLE',
    'DEL',
    'EUROPE',
    'EUROPA',
    'SHOP',
    'DITTA',
    'SOCIETA',
]);

export function normalizePartnerName(s: string): string {
    return s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim();
}

function significantTokens(normalized: string): string[] {
    return normalized
        .split(' ')
        .filter((t) => t.length >= 4 && !PARTNER_NAME_GENERIC_TOKENS.has(t));
}

/**
 * True solo se c’è almeno un token distintivo in comune (word-boundary),
 * oppure inclusione piena di una stringa già significativa (≥2 token distintivi o len≥8).
 * Mai match su solo STUDIO / FIORI / GARDEN / EUROPE / …
 */
export function namesCompatible(a: string, b: string): boolean {
    const na = normalizePartnerName(a);
    const nb = normalizePartnerName(b);
    if (!na || !nb) return false;

    const ta = significantTokens(na);
    const tb = significantTokens(nb);
    if (ta.length === 0 || tb.length === 0) return false;

    // Inclusione solo se il lato più corto è già «distintivo»
    const shorter = na.length <= nb.length ? na : nb;
    const longer = na.length <= nb.length ? nb : na;
    const shorterSig = significantTokens(shorter);
    if (
        shorterSig.length >= 1 &&
        (shorter.length >= 8 || shorterSig.length >= 2) &&
        longer.includes(shorter)
    ) {
        return true;
    }

    // Token distintivi: match intero (non sottostringa tipo ALDO∈SALDO)
    const tbSet = new Set(tb);
    const hits = ta.filter((t) => tbSet.has(t));
    if (hits.length >= 1) return true;

    // Variante: cognome/nome lungo contenuto come parola intera nell’altro lato
    const nbWords = new Set(nb.split(' ').filter(Boolean));
    const naWords = new Set(na.split(' ').filter(Boolean));
    for (const t of ta) {
        if (t.length >= 5 && nbWords.has(t)) return true;
    }
    for (const t of tb) {
        if (t.length >= 5 && naWords.has(t)) return true;
    }

    return false;
}

/** Alias anagrafici in `Partner.internalNotes` con marker `[nameAliases] a · b`. */
export function parsePartnerNameAliases(internalNotes: string | null | undefined): string[] {
    if (!internalNotes) return [];
    const out: string[] = [];
    for (const line of internalNotes.split(/\n+/)) {
        const idx = line.indexOf('[nameAliases]');
        if (idx < 0) continue;
        const rest = line.slice(idx + '[nameAliases]'.length);
        for (const part of rest.split(/[·|;,]/)) {
            const t = part.trim();
            if (t.length >= 4) out.push(t);
        }
    }
    return out;
}

/** True se il testo bancario corrisponde a shop, owner o un alias esplicito. */
export function partnerNamesMatchDescription(
    partner: { shopName: string; ownerName?: string | null; internalNotes?: string | null },
    description: string
): boolean {
    if (namesCompatible(partner.shopName, description)) return true;
    if (partner.ownerName && namesCompatible(partner.ownerName, description)) return true;
    for (const alias of parsePartnerNameAliases(partner.internalNotes)) {
        if (namesCompatible(alias, description)) return true;
    }
    return false;
}
