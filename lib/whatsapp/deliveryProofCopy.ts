/** Città/luogo per messaggi post-consegna (es. «Roma (RM)»). */
export function resolvePartnerCity(order: {
    cemeteryCity?: string | null;
    cemeteryName?: string | null;
    deliveryProvince?: string | null;
}): string {
    const city = order.cemeteryCity?.trim();
    const provRaw = order.deliveryProvince?.trim().toUpperCase() || '';
    const prov = /^[A-Z]{2}$/.test(provRaw) ? provRaw : '';

    if (city && city.toLowerCase() !== 'non specificato') {
        if (prov && !/\([A-Z]{2}\)\s*$/i.test(city) && !city.toUpperCase().includes(`(${prov})`)) {
            return `${city} (${prov})`;
        }
        return city;
    }

    const cemetery = order.cemeteryName?.trim();
    if (cemetery) {
        if (prov && !/\([A-Z]{2}\)\s*$/i.test(cemetery) && !cemetery.toUpperCase().includes(`(${prov})`)) {
            return `${cemetery} (${prov})`;
        }
        return cemetery;
    }

    return prov || 'Italia';
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
 * Prima riga body post-consegna — allineata al template Meta `floremoria_consegna_foto_utente`.
 */
export function renderDeliveryProofCaption(params: {
    buyerFullName?: string | null;
    partnerCity: string;
    deceasedName: string;
}): string {
    const firstName = extractBuyerFirstName(params.buyerFullName);
    const defunto = (params.deceasedName || 'chi ama').trim();
    const city = params.partnerCity.trim() || 'zona';

    return (
        `Gentile ${firstName},\n` +
        `Le confermiamo che abbiamo consegnato i Suoi fiori a ${city} nel ricordo di ${defunto}.`
    );
}

/** Chiusura ufficiale messaggi post-consegna (SOFIA + ALMA / Meta). */
export const DELIVERY_CONFIRMATION_CLOSING =
    'Tutto lo Staff di FloreMoria resta a Sua completa disposizione.🌹';

/** Header testo approvato Meta `floremoria_consegna_foto_utente` (param {{1}} = comune). */
export const CUSTOMER_DELIVERY_PHOTO_HEADER_CANONICAL =
    'Fiori posati a {{1}} da FloreMoria';

/** Body approvato Meta — unica fonte di verità per registry, fallback e anteprima dashboard. */
export const CUSTOMER_DELIVERY_PHOTO_BODY_CANONICAL =
    'Gentile {{1}},\n' +
    'Le confermiamo che abbiamo consegnato i Suoi fiori a {{2}} nel ricordo di {{3}}.\n' +
    'Le alleghiamo il MagicLink per rivedere tutte le foto nel Suo Giardino della Memoria: {{4}}\n\n' +
    'Vuole ricevere qui la foto della posa?\n' +
    DELIVERY_CONFIRMATION_CLOSING;

function isUsableCustomerDeliveryPhotoBody(value: string): boolean {
    const v = value.trim();
    if (!v) return false;
    if (/immensa\s+gioia/i.test(v)) return false;
    return (
        /\{\{1\}\}/.test(v) &&
        /\{\{2\}\}/.test(v) &&
        /\{\{3\}\}/.test(v) &&
        /\{\{4\}\}/.test(v) &&
        /Le confermiamo che abbiamo consegnato/i.test(v)
    );
}

/** Body template per anteprima: env solo se allineato a Meta (no formule inappropriate). */
export function resolveCustomerDeliveryPhotoBodyTemplate(): string {
    const fromEnv = process.env.WHATSAPP_TEMPLATE_CUSTOMER_DELIVERY_PHOTO_BODY?.trim();
    if (fromEnv && isUsableCustomerDeliveryPhotoBody(fromEnv)) return fromEnv;
    return CUSTOMER_DELIVERY_PHOTO_BODY_CANONICAL;
}

export function renderGiardinoDellaMemoriaLinkMessage(giardinoUrl: string): string {
    return (
        `Le alleghiamo il MagicLink per rivedere tutte le foto nel Suo Giardino della Memoria: ${giardinoUrl}\n\n` +
        `Vuole ricevere qui la foto della posa?\n` +
        DELIVERY_CONFIRMATION_CLOSING
    );
}

/**
 * Fallback free-text (finestra 24h) — stesso copy ufficiale Meta, un solo messaggio.
 * Variabili: {{1}} nome · {{2}} città · {{3}} defunto · {{4}} URL GdM.
 */
export function renderDeliveryConfirmationFreeText(params: {
    buyerFullName?: string | null;
    partnerCity: string;
    deceasedName: string;
    giardinoUrl: string;
}): string {
    const caption = renderDeliveryProofCaption({
        buyerFullName: params.buyerFullName,
        partnerCity: params.partnerCity,
        deceasedName: params.deceasedName,
    });
    return (
        `${caption}\n` +
        `Le alleghiamo il MagicLink per rivedere tutte le foto nel Suo Giardino della Memoria: ${params.giardinoUrl}\n\n` +
        `Vuole ricevere qui la foto della posa?\n` +
        DELIVERY_CONFIRMATION_CLOSING
    );
}
