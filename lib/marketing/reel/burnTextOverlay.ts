/**
 * Burn-in overlay slogan Ziggy su MP4 Veo via ffmpeg.
 * Richiede FFMPEG_PATH o binario `ffmpeg` nel PATH (locale / worker).
 * Su Vercel serverless senza ffmpeg: ritorna null → si pubblica il Veo grezzo.
 */
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import {
  buildElegantTextVideoFilter,
  buildReelOnScreenLines,
  REEL_OVERLAY_DURATION_SEC,
  type ReelOnScreenLine,
} from '@/lib/marketing/reel/reelTextAudio';

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
 * Applica overlay testo sul buffer MP4 Veo.
 * @returns MP4 con slogan, oppure null se ffmpeg assente / errore.
 */
export async function burnZiggyTextOverlay(input: {
  videoMp4: Buffer;
  copy?: string | null;
  lines?: ReelOnScreenLine[];
}): Promise<Buffer | null> {
  const ffmpegPath = await resolveFfmpegBinary();
  if (!ffmpegPath) {
    console.warn(
      '[ReelOverlay] ffmpeg assente — Reel senza burn-in testo (imposta FFMPEG_PATH sul worker).'
    );
    return null;
  }

  const lines = input.lines ?? buildReelOnScreenLines(input.copy);
  const vf = buildElegantTextVideoFilter(lines);

  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const { writeFile, readFile, unlink, mkdtemp } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const execFileAsync = promisify(execFile);

    const dir = await mkdtemp(join(tmpdir(), 'floremoria-overlay-'));
    const inPath = join(dir, 'veo-in.mp4');
    const outPath = join(dir, 'veo-out.mp4');
    await writeFile(inPath, input.videoMp4);

    const args = [
      '-y',
      '-i',
      inPath,
      '-t',
      String(REEL_OVERLAY_DURATION_SEC),
      '-vf',
      vf,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'copy',
      '-movflags',
      '+faststart',
      outPath,
    ];

    await execFileAsync(ffmpegPath, args, { maxBuffer: 40 * 1024 * 1024 });
    const out = await readFile(outPath);

    await Promise.all([
      unlink(inPath).catch(() => undefined),
      unlink(outPath).catch(() => undefined),
    ]);

    console.log(
      `[ReelOverlay] Burn-in OK · ${lines.length} slogan · ${out.length} bytes · ffmpeg=${ffmpegPath}`
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
