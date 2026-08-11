import { META_TEMPLATE_LIMITS } from '@/lib/whatsapp/metaTemplateLimits';
import { sanitizeMetaTemplateParam } from '@/lib/whatsapp/approvedTemplates';

/**
 * Meta rifiuta parametri vuoti / null (#132000 / #132018).
 * Fallback conservativo '-' per slot obbligatori.
 */
export function metaParamOrDash(
    value: string | null | undefined,
    maxLen: number = META_TEMPLATE_LIMITS.general
): string {
    const cleaned = sanitizeMetaTemplateParam(String(value ?? ''), maxLen);
    return cleaned || '-';
}

/** Parametri leggibili per template fiorista (anche se Meta usa separatori nel body approvato). */
export function formatFloristOrderCodeParam(orderCode: string): string {
    return metaParamOrDash(orderCode, META_TEMPLATE_LIMITS.orderCode);
}

/**
 * Compenso per ft_1: il body Meta dice «importo totale di {{3}}» (es. 20€).
 */
export function formatFloristCompensationParam(compensationLabel: string): string {
    const raw = String(compensationLabel ?? '').trim();
    if (!raw) return metaParamOrDash('da confermare', META_TEMPLATE_LIMITS.priceLabel);
    // Evita doppio prefisso "Compenso …" se già formattato.
    if (/^\d+\s*€?$/.test(raw) || /€\s*\d+/.test(raw) || /\d+\s*€/.test(raw)) {
        return metaParamOrDash(raw.replace(/\s+/g, ''), META_TEMPLATE_LIMITS.priceLabel);
    }
    if (/^compenso/i.test(raw)) return metaParamOrDash(raw, META_TEMPLATE_LIMITS.priceLabel);
    return metaParamOrDash(raw, META_TEMPLATE_LIMITS.priceLabel);
}

/**
 * Compenso per `floremoria_nuovo_ordine_fiorista`: body «importo di {{6}}€»
 * → solo numero (Meta aggiunge già il simbolo €).
 */
export function formatFloristPriceAmountParam(compensationLabel: string): string {
    const raw = String(compensationLabel ?? '').trim();
    const match = raw.replace(',', '.').match(/(\d+(?:\.\d+)?)/);
    if (match?.[1]) {
        const n = Math.round(Number(match[1]));
        if (Number.isFinite(n) && n > 0) return String(n);
    }
    return metaParamOrDash('0', META_TEMPLATE_LIMITS.priceLabel);
}

/** Nome defunto senza prefisso "Per" (il testo Meta ha già «ricordo di / tomba di»). */
export function formatFloristDeceasedParam(deceasedName: string): string {
    const name = String(deceasedName ?? '')
        .trim()
        .replace(/^per\s+/i, '');
    return metaParamOrDash(name || 'defunto', META_TEMPLATE_LIMITS.deceasedName);
}

/**
 * Luogo per florist_repeat («presso {{3}}»): es. «cimitero di Siderno Superiore».
 */
export function formatFloristLocationParam(locationLabel: string): string {
    const loc = String(locationLabel ?? '').trim();
    if (!loc) return metaParamOrDash('cimitero da confermare', META_TEMPLATE_LIMITS.locationLabel);
    if (/^presso\s/i.test(loc) || /^cimitero\s/i.test(loc)) {
        return metaParamOrDash(loc, META_TEMPLATE_LIMITS.locationLabel);
    }
    return metaParamOrDash(`cimitero di ${loc}`, META_TEMPLATE_LIMITS.locationLabel);
}

/**
 * Città/cimitero per ft_3 («presso il cimitero di {{2}}»): solo toponimo.
 */
export function formatFloristCemeteryCityParam(cityOrCemetery: string): string {
    const raw = String(cityOrCemetery ?? '')
        .trim()
        .replace(/^presso\s+(il\s+)?cimitero\s+(di\s+)?/i, '')
        .replace(/^cimitero\s+(di\s+)?/i, '');
    return metaParamOrDash(raw || 'luogo da confermare', META_TEMPLATE_LIMITS.locationLabel);
}

export function formatFloristDeliveryPositionParam(position: string): string {
    const pos = String(position ?? '').trim();
    return metaParamOrDash(pos || 'Indicazioni in app', META_TEMPLATE_LIMITS.locationLabel);
}

export function formatFloristDeliveryUrlParam(url: string): string {
    return metaParamOrDash(url, META_TEMPLATE_LIMITS.url);
}

export function formatFloristYesNoParam(value: boolean): string {
    return value ? 'Sì' : 'No';
}

export function formatFloristTicketTextParam(text: string | null | undefined): string {
    return metaParamOrDash(text?.trim() || 'Nessuno', META_TEMPLATE_LIMITS.ticketText);
}
