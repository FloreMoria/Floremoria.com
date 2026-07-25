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

export function extractBuyerLastName(fullName?: string | null): string {
    const trimmed = (fullName || '').trim();
    if (!trimmed) return '';
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0]!;
    
    // Rimuovi parole di test comuni alla fine
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

/** Saluto storico: "Buongiorno Sig. [Cognome]" o "Buongiorno". */
export function formatDeliverySalutation(buyerFullName?: string | null): string {
    const lastName = extractBuyerLastName(buyerFullName);
    if (!lastName) return 'Buongiorno';
    return `Buongiorno Sig. ${lastName}`;
}

/**
 * Testo caldo post-consegna (CAPITOLO 1 chat storiche).
 */
export function renderDeliveryProofCaption(params: {
    buyerFullName?: string | null;
    partnerCity: string;
    deceasedName: string;
}): string {
    const saluto = formatDeliverySalutation(params.buyerFullName);
    const defunto = (params.deceasedName || 'chi ama').trim();
    const city = params.partnerCity.trim() || 'zona';

    return `${saluto}, con immensa gioia Le confermiamo che i fiori nel ricordo di ${defunto} sono stati posati con cura al cimitero di ${city}. In allegato la foto della consegna 🌹`;
}

export function renderGiardinoDellaMemoriaLinkMessage(giardinoUrl: string): string {
    return `Può rivedere tutte le foto nel Suo Giardino della Memoria:\n${giardinoUrl}\n\nHa ricevuto bene la foto della posa? Scriva OK o ci risponda qui per qualsiasi richiesta 🌹\n\nRestiamo a Sua completa disposizione.\nTutto lo Staff di FloreMoria`;
}
