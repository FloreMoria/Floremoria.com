import { META_TEMPLATE_LIMITS } from '@/lib/whatsapp/metaTemplateLimits';

/** Parametri leggibili per template fiorista (anche se Meta usa separatori nel body approvato). */
export function formatFloristOrderCodeParam(orderCode: string): string {
    const code = orderCode.trim() || '—';
    return code.length <= META_TEMPLATE_LIMITS.orderCode ? code : code.slice(0, META_TEMPLATE_LIMITS.orderCode);
}

export function formatFloristCompensationParam(compensationLabel: string): string {
    const raw = compensationLabel.trim() || 'da confermare in app';
    if (/^compenso/i.test(raw)) return raw.slice(0, META_TEMPLATE_LIMITS.priceLabel);
    return `Compenso ${raw}`.slice(0, META_TEMPLATE_LIMITS.priceLabel);
}

export function formatFloristDeceasedParam(deceasedName: string): string {
    const name = deceasedName.trim() || 'defunto';
    const labeled = /^per\s/i.test(name) ? name : `Per ${name}`;
    return labeled.slice(0, META_TEMPLATE_LIMITS.deceasedName);
}

export function formatFloristLocationParam(locationLabel: string): string {
    const loc = locationLabel.trim() || 'luogo da confermare';
    const labeled = /^presso\s/i.test(loc) ? loc : `Presso ${loc}`;
    return labeled.slice(0, META_TEMPLATE_LIMITS.locationLabel);
}

export function formatFloristDeliveryPositionParam(position: string): string {
    const pos = position.trim() || 'Consegna in sede';
    return pos.slice(0, META_TEMPLATE_LIMITS.locationLabel);
}

export function formatFloristDeliveryUrlParam(url: string): string {
    return url.trim().slice(0, META_TEMPLATE_LIMITS.url);
}
