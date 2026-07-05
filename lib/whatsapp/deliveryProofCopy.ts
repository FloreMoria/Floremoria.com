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

function extractBuyerFirstName(fullName?: string | null): string {
    const trimmed = (fullName || '').trim();
    if (!trimmed) return '';
    const parts = trimmed.split(/\s+/).filter(Boolean);
    return parts.length ? parts[parts.length - 1]! : trimmed;
}

/** Saluto storico: "Buongiorno Sig./sig. [Nome]" o "Gentile [Nome]". */
export function formatDeliverySalutation(buyerFullName?: string | null): string {
    const firstName = extractBuyerFirstName(buyerFullName);
    if (!firstName) return 'Buongiorno';
    return `Buongiorno Sig. ${firstName}`;
}

/**
 * Testo caldo post-consegna (CAPITOLO 1 chat storiche).
 * Il link al Giardino della Memoria va inviato in un secondo messaggio testuale.
 */
export function renderDeliveryProofCaption(params: {
    buyerFullName?: string | null;
    partnerCity: string;
    deceasedName: string;
}): string {
    const saluto = formatDeliverySalutation(params.buyerFullName);
    const defunto = (params.deceasedName || 'chi ama').trim();
    const city = params.partnerCity.trim() || 'zona';

    return `${saluto}, il nostro partner di ${city} ha consegnato i fiori nel ricordo di ${defunto}. Le alleghiamo la testimonianza fotografica della consegna.`;
}

export function renderGiardinoDellaMemoriaLinkMessage(giardinoUrl: string): string {
    return `Per rivedere tutte le foto nel Suo Giardino della Memoria:\n${giardinoUrl}\n\nRestiamo a Sua completa disposizione.\nTutto lo Staff di FloreMoria le augura una buona giornata 🌹`;
}
