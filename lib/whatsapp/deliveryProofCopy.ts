/** Città/luogo per messaggi post-consegna (es. Reggio Calabria). */
export function resolvePartnerCity(order: {
    cemeteryCity?: string | null;
    cemeteryName?: string | null;
    deliveryProvince?: string | null;
}): string {
    const city = order.cemeteryCity?.trim();
    if (city && city.toLowerCase() !== 'non specificato') return city;
    const cemetery = order.cemeteryName?.trim();
    if (cemetery) return cemetery;
    return order.deliveryProvince?.trim() || 'Italia';
}

export function extractBuyerFirstName(fullName?: string | null): string {
    const trimmed = (fullName || '').trim();
    if (!trimmed) return 'Cliente';

    // Rimuoviamo Sig., Sig.ra, Signora, Signor, dr., dott., dott.ssa, gentile, ecc.
    const clean = trimmed
        .replace(/^(sig\.|sig\.ra|signora|signor|egregio|egregia|gentile|dott\.|dott\.ssa|dr\.|dr\.ssa)\s+/i, '')
        .trim();

    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'Cliente';

    const firstName = parts[0]!;
    // Sanitizzazione del nome: prendiamo solo caratteri alfabetici
    const cleanFirstName = firstName.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ'’-]/g, '');
    const lower = cleanFirstName.toLowerCase();
    if (!cleanFirstName || lower === 'prova' || lower === 'test' || lower === 'sandbox' || lower === 'dev') {
        return 'Cliente';
    }

    return cleanFirstName.charAt(0).toUpperCase() + cleanFirstName.slice(1);
}

export function extractBuyerLastName(fullName?: string | null): string {
    const trimmed = (fullName || '').trim();
    if (!trimmed) return '';
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0]!;
    
    let lastIdx = parts.length - 1;
    while (lastIdx > 0) {
        const word = parts[lastIdx]!.toLowerCase();
        if (word === 'prova' || word === 'test' || word === 'sandbox' || word === 'dev') {
            lastIdx--;
        } else {
            break;
        }
    }
    return parts[lastIdx] || parts[parts.length - 1]!;
}

/** Saluto storico: "Gentile [Nome]" o "Gentile Cliente". */
export function formatDeliverySalutation(buyerFullName?: string | null): string {
    const firstName = extractBuyerFirstName(buyerFullName);
    return `Gentile ${firstName}`;
}

/**
 * Testo caldo post-consegna (CAPITOLO 1 chat storiche).
 */
export function renderDeliveryProofCaption(params: {
    buyerFullName?: string | null;
    partnerCity: string;
    deceasedName: string;
}): string {
    const firstName = extractBuyerFirstName(params.buyerFullName);
    const saluto = `Gentile ${firstName},`;
    const defunto = (params.deceasedName || 'chi ama').trim();
    const city = params.partnerCity.trim() || 'zona';

    return `${saluto} con immensa gioia Le confermiamo che abbiamo consegnato i Suoi fiori a ${city} nel ricordo di ${defunto}. In allegato la foto della consegna 🌹`;
}

export function renderGiardinoDellaMemoriaLinkMessage(giardinoUrl: string): string {
    return `Può rivedere tutte le foto nel Suo Giardino della Memoria:\n${giardinoUrl}\n\nHa ricevuto bene la foto della posa? Scriva OK o ci risponda qui per qualsiasi richiesta 🌹\n\nRestiamo a Sua completa disposizione.\nTutto lo Staff di FloreMoria`;
}
