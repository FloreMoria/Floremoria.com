/**
 * Watermark FloreMoria su media campagna.
 * Usa PNG con alpha reale (scacchiera rimossa) — non i file "senza fondo"
 * che avevano la scacchiera cotta nei pixel.
 */
import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Larghezza watermark = 12.5% dell'immagine (metà del precedente 25%). */
const WATERMARK_WIDTH_RATIO = 0.125;
const WATERMARK_OPACITY = 0.88;
const WATERMARK_PADDING_RATIO = 0.035;

const WATERMARK_CANDIDATES = [
    'public/images/brand/Logo FloreMoria ESTESO watermark.png',
    'public/images/brand/Logo FloreMoria.png', // fallback icona con alpha reale
] as const;

function resolveWatermarkPath(): string | null {
    for (const rel of WATERMARK_CANDIDATES) {
        const full = resolve(process.cwd(), rel);
        if (existsSync(full)) return full;
    }
    return null;
}

/** Prepara il buffer logo ridimensionato con opacità, alpha preservata. */
async function buildWatermarkBuffer(targetWidth: number): Promise<{
    buffer: Buffer;
    width: number;
    height: number;
} | null> {
    const logoPath = resolveWatermarkPath();
    if (!logoPath) {
        console.warn('[Watermark] Nessun logo trasparente trovato — skip.');
        return null;
    }

    const resized = await sharp(logoPath)
        .ensureAlpha()
        .resize({
            width: Math.max(48, targetWidth),
            fit: 'inside',
            withoutEnlargement: false,
        })
        .raw()
        .toBuffer({ resolveWithObject: true });

    const { data, info } = resized;
    for (let i = 3; i < data.length; i += 4) {
        data[i] = Math.round(data[i] * WATERMARK_OPACITY);
    }

    const buffer = await sharp(data, {
        raw: { width: info.width, height: info.height, channels: 4 },
    })
        .png()
        .toBuffer();

    return { buffer, width: info.width, height: info.height };
}

/**
 * Sovrappone il wordmark FloreMoria in basso a destra.
 * Perché: branding discreto su ogni canale, senza plate/scacchiera.
 */
export async function overlayFloreMoriaWatermark(imageBuffer: Buffer): Promise<Buffer> {
    try {
        const metadata = await sharp(imageBuffer).metadata();
        const bgWidth = metadata.width || 1024;
        const bgHeight = metadata.height || 1024;

        const prepared = await buildWatermarkBuffer(Math.round(bgWidth * WATERMARK_WIDTH_RATIO));
        if (!prepared) return imageBuffer;

        const paddingX = Math.round(bgWidth * WATERMARK_PADDING_RATIO);
        const paddingY = Math.round(bgHeight * WATERMARK_PADDING_RATIO);
        const left = Math.max(0, bgWidth - prepared.width - paddingX);
        const top = Math.max(0, bgHeight - prepared.height - paddingY);

        let pipeline = sharp(imageBuffer).composite([
            { input: prepared.buffer, left, top },
        ]);

        if (metadata.format === 'jpeg' || metadata.format === 'jpg') {
            return pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
        }
        if (metadata.format === 'webp') {
            return pipeline.webp({ quality: 90 }).toBuffer();
        }
        return pipeline.png().toBuffer();
    } catch (err) {
        console.error('[Watermark] Errore overlay:', err);
        return imageBuffer;
    }
}
