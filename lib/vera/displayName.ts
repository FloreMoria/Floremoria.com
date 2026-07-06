/**
 * Nomi profilo WhatsApp utilizzabili in saluto (esclude domini, brand, numeri puri).
 */
export function isUsableWhatsAppPersonName(raw: string | null | undefined): boolean {
    if (!raw?.trim()) return false;

    const name = raw.trim();
    if (name.startsWith('+') || name.startsWith('whatsapp:')) return false;
    if (name.includes('@')) return false;
    if (/https?:\/\//i.test(name)) return false;
    if (/\.(it|com|org|net|eu|io|shop|store)\b/i.test(name)) return false;
    if (/^galleria\s*mag/i.test(name)) return false;
    if (/\b(galleria|mag\.?it|shop|store|srl|spa|ltd)\b/i.test(name) && !/\s{1,}/.test(name)) return false;
    if (/^\d[\d\s]*$/.test(name)) return false;

    return true;
}

export function sanitizeWhatsAppDisplayName(raw: string | null | undefined): string | null {
    if (!isUsableWhatsAppPersonName(raw)) return null;
    return raw!.trim();
}
