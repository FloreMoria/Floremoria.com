import sharp from 'sharp';

/**
 * Raddrizza via EXIF, opzionalmente ruota ulteriormente, esporta WebP senza tag orientamento.
 * I pixel risultanti sono già upright: nessun browser può rigirare la foto via metadati.
 */
export async function normalizeProofImageBuffer(
    input: Buffer,
    extraRotateDegrees?: number
): Promise<Buffer> {
    // failOn:none → tollera HEIC/JPEG parziali da smartphone senza abortire tutto il pipeline.
    let pipeline = sharp(input, { failOn: 'none', unlimited: true }).rotate();

    if (extraRotateDegrees) {
        pipeline = pipeline.rotate(extraRotateDegrees);
    }

    return pipeline
        .resize({
            width: 2000,
            height: 2000,
            fit: 'inside',
            withoutEnlargement: true,
        })
        .webp({ quality: 80 })
        .withMetadata({ orientation: 1 })
        .toBuffer();
}
