/**
 * Layout feed con colonna beige + slogan e logo da asset — zero testo generato dall'AI.
 */
import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pickApprovedSlogan } from '@/lib/marketing/italianCopyGuard';

const LOGO_CANDIDATES = [
  'public/images/brand/Logo FloreMoria ESTESO watermark.png',
  'public/images/brand/Logo FloreMoria.png',
] as const;

const BEIGE = '#F5F0E8';
const TEXT_COLOR = '#3D3832';

function resolveLogoPath(): string | null {
  for (const rel of LOGO_CANDIDATES) {
    const full = resolve(process.cwd(), rel);
    if (existsSync(full)) return full;
  }
  return null;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Wrap slogan in righe ~22 char per colonna stretta. */
function wrapSloganLines(slogan: string, maxChars = 22): string[] {
  const words = slogan.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const next = current ? `${current} ${w}` : w;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = w;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 4);
}

/**
 * Composizione deterministica: colonna beige sinistra (logo + slogan) + foto destra.
 * Perché: slogan e marchio nitidi, mai allucinati dal modello immagine.
 */
export async function composeBrandedFeedLayout(input: {
  photoBuffer: Buffer;
  sloganSeed?: string;
  /** Larghezza colonna testo = frazione canvas (default 32%). */
  columnRatio?: number;
}): Promise<Buffer> {
  const columnRatio = input.columnRatio ?? 0.32;
  const slogan = pickApprovedSlogan(input.sloganSeed || '');
  const lines = wrapSloganLines(slogan);

  const photoMeta = await sharp(input.photoBuffer).metadata();
  const height = photoMeta.height || 1080;
  const width = photoMeta.width || 1080;
  const colW = Math.round(width * columnRatio);
  const photoW = width - colW;

  const photoPart = await sharp(input.photoBuffer)
    .resize(photoW, height, { fit: 'cover', position: 'centre' })
    .toBuffer();

  const logoPath = resolveLogoPath();
  let logoSvg = '';
  if (logoPath) {
    const logoBuf = await sharp(logoPath)
      .resize(Math.round(colW * 0.72), undefined, { fit: 'inside' })
      .png()
      .toBuffer();
    const logoB64 = logoBuf.toString('base64');
    logoSvg = `<image href="data:image/png;base64,${logoB64}" x="${Math.round(colW * 0.14)}" y="${Math.round(height * 0.12)}" width="${Math.round(colW * 0.72)}" preserveAspectRatio="xMidYMid meet"/>`;
  }

  const textStartY = Math.round(height * 0.42);
  const lineHeight = Math.round(height * 0.055);
  const textElements = lines
    .map(
      (line, i) =>
        `<text x="${Math.round(colW * 0.12)}" y="${textStartY + i * lineHeight}" ` +
        `font-family="Georgia, 'Times New Roman', serif" font-size="${Math.round(height * 0.028)}" ` +
        `fill="${TEXT_COLOR}" font-style="italic">${escapeXml(line)}</text>`
    )
    .join('');

  const columnSvg = Buffer.from(
    `<svg width="${colW}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="100%" height="100%" fill="${BEIGE}"/>` +
      logoSvg +
      textElements +
      `</svg>`
  );

  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: BEIGE,
    },
  })
    .composite([
      { input: columnSvg, left: 0, top: 0 },
      { input: photoPart, left: colW, top: 0 },
    ])
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}

/** Feed Meta: layout brand con slogan approvato; altri canali restano watermark leggero. */
export function shouldApplyBrandedFeedLayout(
  targetChannel: string,
  contentFormat: string
): boolean {
  if (contentFormat !== 'FEED_POST') return false;
  return targetChannel === 'META_INSTAGRAM' || targetChannel === 'META_FACEBOOK';
}
