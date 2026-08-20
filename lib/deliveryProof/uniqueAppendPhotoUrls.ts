/**
 * Helper URL prove di consegna: merge univoco preservando ordine di arrivo.
 */

const MAX_DELIVERY_PHOTO_URLS = 24;

export function uniqueAppendPhotoUrls(
    existing: string[] | null | undefined,
    next: string | string[],
    max = MAX_DELIVERY_PHOTO_URLS
): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const push = (raw: string) => {
        const url = raw.trim();
        if (!url || seen.has(url)) return;
        seen.add(url);
        out.push(url);
    };
    for (const u of existing || []) push(u);
    if (Array.isArray(next)) {
        for (const u of next) push(u);
    } else {
        push(next);
    }
    if (out.length <= max) return out;
    return out.slice(out.length - max);
}

export { MAX_DELIVERY_PHOTO_URLS };
