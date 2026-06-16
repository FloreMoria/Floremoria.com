/** Slug pulito per nomi file PoD (minuscolo, senza accenti). */
export function slugifyProofName(text: string): string {
    return text
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]+/g, '')
        .replace(/-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}

/** Data consegna in formato CEO: gg-mm-aaaa (es. 16-06-2026). */
export function formatProofDeliveryDate(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}

export function buildElegantProofFilename(deceasedFullName: string, date = new Date()): string {
    const deceasedSlug = slugifyProofName(deceasedFullName) || 'defunto';
    return `${deceasedSlug}-${formatProofDeliveryDate(date)}.webp`;
}

/** Estrae un nome file scaricabile dall'URL Blob o dal defunto. */
export function downloadFilenameFromProofUrl(url: string, deceasedFullName: string): string {
    try {
        const segment = new URL(url).pathname.split('/').pop();
        if (segment && segment.includes('.webp')) {
            return decodeURIComponent(segment.split('?')[0] ?? segment);
        }
    } catch {
        /* fallback sotto */
    }
    return buildElegantProofFilename(deceasedFullName);
}
