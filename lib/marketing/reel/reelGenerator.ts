/**
 * Generatore Reel automatici FloreMoria — standard visual 2026-08.
 *
 * 1) Sorgente visiva ESCLUSIVA: B-roll 4K d'archivio (mai foto/video fioristi).
 * 2) Testo on-screen: typography elegante, slogan/CTA a comparsa ritmica.
 * 3) Audio: solo musica strumentale/ambiente (vietato TTS / voce sintetica).
 */
import { put } from '@vercel/blob';
import {
  loadConfiguredBrollClips,
  pickBrollClip,
  resolveInstrumentalMusicUrl,
} from '@/lib/marketing/reel/brollLibrary';
import {
  buildElegantTextVideoFilter,
  buildReelOnScreenLines,
} from '@/lib/marketing/reel/reelTextAudio';

const REEL_VIDEO_PREFIX = 'marketing/campagne/reel-videos';
const REEL_DURATION_SEC = 15;

export type GenerateReelInput = {
  campaignId: string;
  /** @deprecated Ignorato: non usare mai immagini campagna/consegna come B-roll. */
  imageUrl?: string;
  copy?: string | null;
  blobToken?: string;
};

/**
 * Restituisce URL MP4 9:16 per pubblicazione Reel.
 * Non usa mai asset fioristi / social-ready / foto campagna.
 */
export async function generateAutomaticReelVideo(
  input: GenerateReelInput
): Promise<string | null> {
  const clips = loadConfiguredBrollClips();
  const clip = pickBrollClip(input.campaignId, clips);

  if (!clip) {
    console.error(
      '[ReelGenerator] Nessun B-roll configurato. Imposta MARKETING_REEL_BROLL_URLS ' +
        '(video 4K archivio: cimiteri monumentali, marmo, fiori, tramonti) ' +
        'e opzionalmente MARKETING_REEL_MUSIC_URL (strumentale). ' +
        'Foto/video fioristi sono disabilitati per i Reel automatici.'
    );
    return null;
  }

  if (input.imageUrl && /social-ready|foto-consegne|delivery/i.test(input.imageUrl)) {
    console.warn(
      `[ReelGenerator] Ignorata sorgente consegna/fiorista per campagna ${input.campaignId} — uso solo B-roll.`
    );
  }

  const lines = buildReelOnScreenLines(input.copy);
  const musicUrl = resolveInstrumentalMusicUrl();
  const ffmpegPath = process.env.FFMPEG_PATH?.trim();

  console.log(
    `[ReelGenerator] Campagna ${input.campaignId} · B-roll=${clip.id} (${clip.mood}) · ` +
      `music=${musicUrl ? 'strumentale' : 'nessuna'} · ffmpeg=${ffmpegPath ? 'sì' : 'no'} · TTS=vietato`
  );

  if (ffmpegPath) {
    const rendered = await renderReelWithFfmpeg({
      ffmpegPath,
      brollUrl: clip.url,
      musicUrl,
      lines,
      campaignId: input.campaignId,
    });
    if (rendered) {
      const token = input.blobToken || process.env.BLOB_READ_WRITE_TOKEN?.trim();
      if (!token) {
        console.warn('[ReelGenerator] BLOB_READ_WRITE_TOKEN assente — ritorno URL B-roll diretto.');
        return clip.url;
      }
      const blobPath = `${REEL_VIDEO_PREFIX}/${input.campaignId}.mp4`;
      const { url } = await put(blobPath, rendered, {
        access: 'public',
        contentType: 'video/mp4',
        token,
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      return url;
    }
  }

  // Senza ffmpeg: pubblica il B-roll grezzo (meglio del fotogramma fiorista).
  // Template pre-montato opzionale (già con testo/musica autorizzata).
  const prebuilt = process.env.MARKETING_REEL_TEMPLATE_MP4_URL?.trim();
  if (prebuilt && /^https?:\/\//i.test(prebuilt)) {
    console.log('[ReelGenerator] Uso MARKETING_REEL_TEMPLATE_MP4_URL (template pre-montato).');
    return prebuilt;
  }

  console.log(
    `[ReelGenerator] Pubblico B-roll diretto (senza overlay locale): ${clip.label}`
  );
  return clip.url;
}

async function renderReelWithFfmpeg(input: {
  ffmpegPath: string;
  brollUrl: string;
  musicUrl: string | null;
  lines: ReturnType<typeof buildReelOnScreenLines>;
  campaignId: string;
}): Promise<Buffer | null> {
  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const { writeFile, readFile, unlink, mkdtemp } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const execFileAsync = promisify(execFile);

    const dir = await mkdtemp(join(tmpdir(), 'floremoria-reel-'));
    const brollPath = join(dir, 'broll-src.mp4');
    const musicPath = join(dir, 'music-src.audio');
    const outputPath = join(dir, 'reel-out.mp4');

    const brollRes = await fetch(input.brollUrl);
    if (!brollRes.ok) {
      throw new Error(`Download B-roll fallito (${brollRes.status})`);
    }
    await writeFile(brollPath, Buffer.from(await brollRes.arrayBuffer()));

    let hasMusic = false;
    if (input.musicUrl) {
      const musicRes = await fetch(input.musicUrl);
      if (musicRes.ok) {
        await writeFile(musicPath, Buffer.from(await musicRes.arrayBuffer()));
        hasMusic = true;
      } else {
        console.warn('[ReelGenerator] Download musica strumentale fallito — proseguo senza audio.');
      }
    }

    const vf = buildElegantTextVideoFilter(input.lines);
    const args = hasMusic
      ? [
          '-y',
          '-stream_loop',
          '-1',
          '-i',
          brollPath,
          '-stream_loop',
          '-1',
          '-i',
          musicPath,
          '-t',
          String(REEL_DURATION_SEC),
          '-vf',
          vf,
          '-map',
          '0:v:0',
          '-map',
          '1:a:0',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          '-shortest',
          // Nessuna traccia voce / TTS: solo mix strumentale.
          '-af',
          'volume=0.35',
          outputPath,
        ]
      : [
          '-y',
          '-stream_loop',
          '-1',
          '-i',
          brollPath,
          '-t',
          String(REEL_DURATION_SEC),
          '-vf',
          vf,
          '-an',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          outputPath,
        ];

    await execFileAsync(input.ffmpegPath, args, { maxBuffer: 20 * 1024 * 1024 });
    const mp4 = await readFile(outputPath);

    await Promise.all([
      unlink(brollPath).catch(() => undefined),
      unlink(outputPath).catch(() => undefined),
      hasMusic ? unlink(musicPath).catch(() => undefined) : Promise.resolve(),
    ]);

    console.log(
      `[ReelGenerator] Render ffmpeg OK · campagna ${input.campaignId} · ${mp4.length} bytes · TTS=no`
    );
    return mp4;
  } catch (e) {
    console.warn(
      '[ReelGenerator] ffmpeg render fallito:',
      e instanceof Error ? e.message : e
    );
    return null;
  }
}
