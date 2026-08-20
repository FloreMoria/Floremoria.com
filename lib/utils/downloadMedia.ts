/**
 * Helper riutilizzabile per il download universale cross-device di foto e allegati.
 * 
 * - Su SMARTPHONE / MOBILE (iOS & Android):
 *   Usa la Web Share API ('navigator.share' con 'files') per permettere all'utente
 *   di salvare la foto direttamente nel Rullino/Galleria (Camera Roll) o condividerla.
 * 
 * - Su DESKTOP / COMPUTER (e fallback mobile):
 *   Effettua il fetch (diretto o tramite proxy '/api/download'), converte in Blob,
 *   genera l'Object URL e innesca il download con tag <a> programmatico.
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

/** Prepara un nome file pulito e valido con estensione corretta. */
export function sanitizeDownloadFilename(rawUrl: string, customName?: string): string {
    if (customName && customName.trim()) {
        const clean = customName.trim().replace(/[/\\?%*:|"<>]/g, '_');
        if (!/\.[a-z0-9]{3,4}$/i.test(clean)) {
            const extMatch = rawUrl.split('?')[0].match(/\.([a-z0-9]{3,4})$/i);
            const ext = extMatch ? extMatch[1] : 'jpg';
            return `${clean}.${ext}`;
        }
        return clean;
    }

    try {
        const cleanUrl = rawUrl.split('?')[0];
        const basename = cleanUrl.split('/').pop();
        if (basename && /\.[a-z0-9]{3,4}$/i.test(basename)) {
            return basename.replace(/[/\\?%*:|"<>]/g, '_');
        }
    } catch {
        /* fallback sotto */
    }

    return `floremoria-foto-${Date.now()}.jpg`;
}

export async function downloadMedia(options: DownloadMediaOptions): Promise<DownloadMediaResult> {
    const { url, filename, title } = options;

    if (!url || !url.trim()) {
        return { success: false, error: 'URL del file non valido.' };
    }

    const cleanUrl = url.trim();
    const finalFilename = sanitizeDownloadFilename(cleanUrl, filename);

    try {
        // Step 1: Tentativo di Fetch diretto del Blob
        let blob: Blob | null = null;

        try {
            const directRes = await fetch(cleanUrl, { cache: 'no-store' });
            if (directRes.ok) {
                blob = await directRes.blob();
            }
        } catch {
            blob = null;
        }

        // Step 2: Fallback tramite API Proxy interna se il fetch diretto fallisce (es. CORS cross-origin)
        if (!blob) {
            const proxyEndpoint = `/api/download?url=${encodeURIComponent(cleanUrl)}&filename=${encodeURIComponent(finalFilename)}`;
            const proxyRes = await fetch(proxyEndpoint, { cache: 'no-store' });
            if (!proxyRes.ok) {
                throw new Error(`Impossibile scaricare la risorsa (HTTP ${proxyRes.status}).`);
            }
            blob = await proxyRes.blob();
        }

        const mimeType = blob.type || (finalFilename.endsWith('.png') ? 'image/png' : 'image/jpeg');

        // Step 3: Supporto Web Share API per dispositivi Mobile (iOS Safari / Android Chrome)
        if (typeof navigator !== 'undefined' && navigator.canShare && typeof File !== 'undefined') {
            try {
                const file = new File([blob], finalFilename, { type: mimeType });
                if (navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        files: [file],
                        title: title || 'Foto FloreMoria',
                    });
                    return { success: true };
                }
            } catch (shareError) {
                // Se l'utente annulla la finestra di condivisione (AbortError), non mostrare errore
                if (shareError instanceof Error && shareError.name === 'AbortError') {
                    return { success: true };
                }
                // Altrimenti prosegui al fallback per il download browser
            }
        }

        // Step 4: Download programmatico per Desktop (e fallback mobile senza Web Share)
        const objectUrl = URL.createObjectURL(blob);
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
            URL.revokeObjectURL(objectUrl);
        }, 1000);

        return { success: true };
    } catch (err) {
        console.error('[downloadMedia] Errore durante il download:', err);
        const errorMsg = err instanceof Error ? err.message : 'Impossibile scaricare il file.';
        return { success: false, error: errorMsg };
    }
}
