/**
 * Limiti conservativi per variabili template Meta WhatsApp.
 * Meta ammette fino a 1024 caratteri per parametro, ma i template approvati
 * possono troncare silenziosamente slot più corti — usiamo margini di sicurezza.
 */
export const META_TEMPLATE_LIMITS = {
    shortName: 48,
    deceasedName: 80,
    /** Slot {{3}} conferma ordine — CTA inclusa; Meta tronca oltre ~92 caratteri. */
    warmThought: 92,
    orderCode: 32,
    locationLabel: 120,
    priceLabel: 28,
    ticketText: 200,
    url: 256,
    staffNotes: 900,
    general: 1024,
} as const;

export function truncateMetaTemplateParam(
    value: string,
    maxLen: number,
    slotLabel?: string
): string {
    const trimmed = value.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (trimmed.length <= maxLen) return trimmed;

    let cut = trimmed.slice(0, maxLen);
    const lastSpace = cut.lastIndexOf(' ');
    if (lastSpace > Math.floor(maxLen * 0.55)) cut = cut.slice(0, lastSpace);
    cut = cut.replace(/[,;:\s]+$/, '');
    if (!/[.!?…]$/.test(cut)) cut += '…';

    if (slotLabel) {
        console.warn(`[meta-template] Parametro "${slotLabel}" troncato da ${trimmed.length} a ${cut.length} caratteri.`);
    }
    return cut;
}

export function assertMetaTemplateParamLengths(
    templateId: string,
    params: Array<{ slot: string; value: string; maxLen: number }>
): void {
    for (const { slot, value, maxLen } of params) {
        if (value.length > maxLen) {
            console.warn(
                `[meta-template] ${templateId} — slot "${slot}" supera ${maxLen} caratteri (${value.length}): ${value.slice(0, 40)}…`
            );
        }
        if (!value.trim()) {
            console.error(`[meta-template] ${templateId} — slot "${slot}" vuoto o nullo.`);
        }
    }
}
