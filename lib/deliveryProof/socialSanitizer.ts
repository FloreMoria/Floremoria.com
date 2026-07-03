import sharp from 'sharp';

export interface SocialSanitizeOptions {
  /** Lato output quadrato in px (default 1080, adatto a Meta). */
  outputSize?: number;
  /** Frazione del lato minimo usata per il crop centrale iniziale (default 0.72). */
  centerCropRatio?: number;
  /** Frazione dell'output dove il bouquet resta a fuoco (default 0.52). */
  sharpCenterRatio?: number;
  /** Intensità blur Gaussian sullo sfondo (default 28). */
  backgroundBlurSigma?: number;
}

const DEFAULTS: Required<SocialSanitizeOptions> = {
  outputSize: 1080,
  centerCropRatio: 0.60,      // Crop più stretto sul bouquet (era 0.72)
  sharpCenterRatio: 0.45,    // Meno area a fuoco per contenere dettagli (era 0.52)
  backgroundBlurSigma: 40,   // Blur gaussiano molto più pesante (era 28)
};

/**
 * Sanifica un buffer foto consegna per uso social:
 * - crop centrale sul bouquet
 * - sfocatura pesante permanente sullo sfondo (lapidi/cimitero irriconoscibili)
 * - strip completo metadati EXIF/GPS
 *
 * Non modifica mai il file sorgente: opera su una copia in memoria.
 */
export async function sanitizeDeliveryPhotoForSocial(
  input: Buffer,
  options: SocialSanitizeOptions = {}
): Promise<Buffer> {
  const cfg = { ...DEFAULTS, ...options };
  const rotated = sharp(input, { failOn: 'none' }).rotate();
  const meta = await rotated.metadata();

  const width = meta.width ?? cfg.outputSize;
  const height = meta.height ?? cfg.outputSize;
  const cropSize = Math.max(
    1,
    Math.round(Math.min(width, height) * cfg.centerCropRatio)
  );
  const left = Math.max(0, Math.round((width - cropSize) / 2));
  const top = Math.max(0, Math.round((height - cropSize) / 2));

  const centerCrop = await sharp(input, { failOn: 'none' })
    .rotate()
    .extract({ left, top, width: cropSize, height: cropSize })
    .toBuffer();

  const size = cfg.outputSize;
  const blurredBackground = await sharp(input, { failOn: 'none' })
    .rotate()
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .blur(cfg.backgroundBlurSigma)
    .toBuffer();

  const sharpSide = Math.max(1, Math.round(size * cfg.sharpCenterRatio));
  const sharpCenter = await sharp(centerCrop)
    .resize(sharpSide, sharpSide, { fit: 'cover', position: 'centre' })
    .toBuffer();

  const offset = Math.round((size - sharpSide) / 2);

  return sharp(blurredBackground)
    .composite([{ input: sharpCenter, left: offset, top: offset }])
    .webp({ quality: 82, effort: 4 })
    .toBuffer();
}
