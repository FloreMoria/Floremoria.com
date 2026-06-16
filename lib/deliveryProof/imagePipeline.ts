import sharp from 'sharp';

/**
 * Raddrizza via EXIF, opzionalmente ruota ulteriormente, esporta WebP senza tag orientamento.
 * I pixel risultanti sono già upright: nessun browser può rigirare la foto via metadati.
 */
export async function normalizeProofImageBuffer(
    input: Buffer,
    extraRotateDegrees?: number
): Promise<Buffer> {
    let pipeline = sharp(input, { failOn: 'none' }).rotate();

    if (extraRotateDegrees) {
        pipeline = pipeline.rotate(extraRotateDegrees);
    }

    return pipeline
        .webp({ quality: 80 })
        .withMetadata({ orientation: 1 })
        .toBuffer();
}
