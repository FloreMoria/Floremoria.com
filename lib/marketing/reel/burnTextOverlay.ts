/**
 * Burn-in overlay slogan e logo FloreMoria su Micro-Video Veo via ffmpeg.
 * Risolve deterministicamente il logo PNG ad alta fedeltà e lo slogan approvato da catalogo.
 * Applica rendering verticale 9:16 (1080x1920) e dissolvenza morbida di chiusura per loop continuo.
 */
import { access } from 'node:fs/promises';
import { constants, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import {
  buildElegantTextVideoFilter,
  buildReelOnScreenLines,
  REEL_OVERLAY_DURATION_SEC,
  type ReelOnScreenLine,
} from '@/lib/marketing/reel/reelTextAudio';

const LOGO_CANDIDATES = [
  'public/images/brand/Logo FloreMoria ESTESO watermark.png',
  'public/images/brand/Logo FloreMoria.png',
  'public/images/brand/Logo FloreMoria senza fondo 100x100.png',
] as const;

function resolveFloreMoriaLogoPath(cwd = process.cwd()): string | null {
  for (const rel of LOGO_CANDIDATES) {
    const full = resolve(cwd, rel);
    if (existsSync(full)) return full;
  }
  return null;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Risolve binario ffmpeg. */
export async function resolveFfmpegBinary(): Promise<string | null> {
  const fromEnv = process.env.FFMPEG_PATH?.trim();
  if (fromEnv && (await fileExists(fromEnv))) return fromEnv;

  const candidates = [
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/usr/bin/ffmpeg',
  ];
  for (const c of candidates) {
    if (await fileExists(c)) return c;
  }

  // Ultimo tentativo: `ffmpeg` sul PATH (senza verifica X_OK assoluta).
  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    await execFileAsync('ffmpeg', ['-version'], { maxBuffer: 1024 * 1024 });
    return 'ffmpeg';
  } catch {
    return null;
  }
}

/**
 * Applica overlay logo e slogan sul buffer MP4 per micro-clip 2-3s a loop continuo.
 * @returns MP4 con logo, slogan e loop cross-fade, oppure null se ffmpeg assente / errore.
 */
export async function burnZiggyTextOverlay(input: {
  videoMp4: Buffer;
  copy?: string | null;
  lines?: ReelOnScreenLine[];
  durationSec?: number;
}): Promise<Buffer | null> {
  const ffmpegPath = await resolveFfmpegBinary();
  if (!ffmpegPath) {
    console.warn(
      '[ReelOverlay] ffmpeg assente — micro-video senza burn-in (imposta FFMPEG_PATH sul worker).'
    );
    return null;
  }

  const duration = input.durationSec ?? REEL_OVERLAY_DURATION_SEC;
  const lines = input.lines ?? buildReelOnScreenLines(input.copy);
  const logoPath = resolveFloreMoriaLogoPath();

  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const { writeFile, readFile, unlink, mkdtemp } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const execFileAsync = promisify(execFile);

    const dir = await mkdtemp(join(tmpdir(), 'floremoria-overlay-'));
    const inPath = join(dir, 'veo-in.mp4');
    const outPath = join(dir, 'veo-out.mp4');
    await writeFile(inPath, input.videoMp4);

    let args: string[];

    if (logoPath) {
      // Pipeline con logo FloreMoria PNG + drawtext slogan + loop fade
      const vfText = buildElegantTextVideoFilter(lines, duration);
      const filterComplex = `[0:v]${vfText}[vbase];[1:v]scale=220:-1,format=rgba,colorchannelmixer=aa=0.88[vlogo];[vbase][vlogo]overlay=x=(W-w)/2:y=H*0.08:format=auto[vout]`;

      args = [
        '-y',
        '-i',
        inPath,
        '-i',
        logoPath,
        '-t',
        duration.toFixed(2),
        '-filter_complex',
        filterComplex,
        '-map',
        '[vout]',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        outPath,
      ];
    } else {
      const vf = buildElegantTextVideoFilter(lines, duration);
      args = [
        '-y',
        '-i',
        inPath,
        '-t',
        duration.toFixed(2),
        '-vf',
        vf,
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        outPath,
      ];
    }

    await execFileAsync(ffmpegPath, args, { maxBuffer: 40 * 1024 * 1024 });
    const out = await readFile(outPath);

    await Promise.all([
      unlink(inPath).catch(() => undefined),
      unlink(outPath).catch(() => undefined),
    ]);

    console.log(
      `[ReelOverlay] Burn-in OK · 9:16 loop (${duration}s) · logo=${Boolean(logoPath)} · slogan="${lines[0]?.text || ''}" · ffmpeg=${ffmpegPath}`
    );
    return out;
  } catch (e) {
    console.warn(
      '[ReelOverlay] Burn-in fallito:',
      e instanceof Error ? e.message : e
    );
    return null;
  }
}

