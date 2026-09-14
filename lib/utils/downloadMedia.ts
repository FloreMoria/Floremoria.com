/**
 * Helper riutilizzabile per il download diretto su disco di immagini e allegati.
 * 
 * COMPORTAMENTO:
 * - Esegue il download DIRETTO sul disco locale (cartella Download del browser/SO).
 * - Nessuna invocazione di navigator.share() o schede di condivisione di sistema.
 * - Effettua il fetch come blob (con fallback automatico su /api/download in caso di CORS o restrizioni upstream).
 * - Crea un Object URL e innesca il download con tag <a> programmatico e attributo download.
 */

export interface DownloadMediaOptions {
    url: string;
    filename?: string;
    title?: string;
}

export interface DownloadMediaResult {
    success: boolean;
    error?: string;
}

/**
 * Pulisce una stringa da caratteri non validi per i filesystem di macOS, Windows e Linux.
 */
export function sanitizeFilenamePart(text: string): string {
    return text
        .trim()
        .replace(/[/\\?%*:|"<>#]/g, '-')
        .replace(/\s+/g, ' ')
        .replace(/-+/g, '-')
        .replace(/^[-. ]+|[-. ]+$/g, '');
}

/**
 * Genera il nome file convenzionale per le foto:
 * - Foto singola: '[CodiceOrdine].[estensione]' (es. 'FT-VE-26-001.jpg')
 * - Più foto contemporanee / galleria: '[CodiceOrdine] (1).[estensione]', '[CodiceOrdine] (2).[estensione]', ecc.
 */
export function buildOrderPhotoFilename(
    reference: string,
    index?: number,
    totalCount?: number,
    defaultExt = 'jpg'
): string {
    const raw = (reference || '').trim();
    if (!raw) {
        const fallbackBase = 'floremoria-foto';
        if (totalCount && totalCount > 1 && index !== undefined) {
            return `${fallbackBase} (${index}).${defaultExt}`;
        }
        return `${fallbackBase}.${defaultExt}`;
    }

    // Verifica se raw ha già un'estensione
    let base = raw;
    let ext = defaultExt;
    const extMatch = raw.match(/\.([a-z0-9]{3,4})$/i);
    if (extMatch) {
        ext = extMatch[1].toLowerCase();
        base = raw.slice(0, -extMatch[0].length);
    }

    const cleanBase = sanitizeFilenamePart(base) || 'floremoria-foto';

    if (totalCount !== undefined && totalCount > 1 && index !== undefined) {
        return `${cleanBase} (${index}).${ext}`;
    }

    return `${cleanBase}.${ext}`;
}

/** Prepara un nome file pulito e valido con estensione corretta (compatibilità). */
export function sanitizeDownloadFilename(rawUrl: string, customName?: string): string {
    if (customName && customName.trim()) {
        const clean = sanitizeFilenamePart(customName);
        if (!/\.[a-z0-9]{3,4}$/i.test(clean)) {
            const extMatch = rawUrl.split('?')[0].match(/\.([a-z0-9]{3,4})$/i);
            const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
            return `${clean}.${ext}`;
        }
        return clean;
    }

    try {
        const cleanUrl = rawUrl.split('?')[0];
        const basename = cleanUrl.split('/').pop();
        if (basename && /\.[a-z0-9]{3,4}$/i.test(basename)) {
            return sanitizeFilenamePart(basename);
        }
    } catch {
        /* fallback sotto */
    }

    return `floremoria-foto-${Date.now()}.jpg`;
}

/**
 * Esegue il download diretto del file dal browser salvandolo sul disco.
 * Non invoca mai la Web Share API (navigator.share).
 */
export async function downloadImageDirectly(
    url: string,
    filename?: string
): Promise<DownloadMediaResult> {
    if (!url || !url.trim()) {
        return { success: false, error: 'URL del file non valido.' };
    }

    const cleanUrl = url.trim();
    const finalFilename = filename && filename.trim()
        ? sanitizeFilenamePart(filename)
        : sanitizeDownloadFilename(cleanUrl);

    try {
        let blob: Blob | null = null;

        // 1. Fetch diretto del Blob
        try {
            const directRes = await fetch(cleanUrl, { cache: 'no-store' });
            if (directRes.ok) {
                blob = await directRes.blob();
            }
        } catch {
            blob = null;
        }

        // 2. Fallback via proxy se fetch diretto fallisce (CORS / autorizzazione cross-origin)
        if (!blob) {
            const proxyEndpoint = `/api/download?url=${encodeURIComponent(cleanUrl)}&filename=${encodeURIComponent(finalFilename)}`;
            const proxyRes = await fetch(proxyEndpoint, { cache: 'no-store' });
            if (!proxyRes.ok) {
                throw new Error(`Impossibile scaricare la risorsa (HTTP ${proxyRes.status}).`);
            }
            blob = await proxyRes.blob();
        }

        // 3. Creazione Object URL e click programmatico su <a> con attributo download
        if (typeof window === 'undefined' || typeof document === 'undefined') {
            return { success: true };
        }

        const objectUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = finalFilename;
        link.style.display = 'none';

        document.body.appendChild(link);
        link.click();

        setTimeout(() => {
            if (document.body.contains(link)) {
                document.body.removeChild(link);
            }
            window.URL.revokeObjectURL(objectUrl);
        }, 1500);

        return { success: true };
    } catch (err) {
        console.error('[downloadImageDirectly] Errore durante il download:', err);
        const errorMsg = err instanceof Error ? err.message : 'Impossibile scaricare il file.';
        return { success: false, error: errorMsg };
    }
}

/**
 * Alias per downloadMedia con firma compatibile.
 */
export async function downloadMedia(options: DownloadMediaOptions): Promise<DownloadMediaResult> {
    return downloadImageDirectly(options.url, options.filename);
}
