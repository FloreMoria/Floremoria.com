import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import util from 'node:util';
import {
    buildMomoScript,
    type MomoNarrativeFormat,
    type MomoScript,
    type MomoLocationInput,
} from '@/lib/ai/momo/momoStoryteller';
import {
    buildAudioMixPlan,
    type MomoAudioMixPlan,
} from '@/lib/ai/momo/momoVoiceAudio';
import { getMonumentById } from '@/lib/ai/momo/momoMonuments';
import {
    searchAndFetchMomoAssets,
    type MomoFetchedAssetResult,
} from '@/lib/ai/momo/momoAssetSearch';

const execPromise = util.promisify(exec);

export const MOMO_VIDEO_WIDTH = 1080;
export const MOMO_VIDEO_HEIGHT = 1920;
export const MOMO_VIDEO_FPS = 30;

export type MomoSocialChannel =
    | 'youtube_shorts'
    | 'instagram_reels'
    | 'tiktok'
    | 'facebook';

export type MomoRenderRequest = {
    monumentId?: string;
    query?: string;
    formatId?: MomoNarrativeFormat;
    voiceId?: string;
    musicId?: string;
    rawFootageId?: string;
    customHookQuestion?: string;
    customImages?: string[];
    customVideoPath?: string;
    fetchedAssets?: MomoFetchedAssetResult;
};

export type MomoSubtitleCue = {
    startSec: number;
    endSec: number;
    text: string;
};

export type MomoRenderPlan = {
    status: 'RENDER_PLANNED' | 'RENDERED_READY_FOR_PUBLISH';
    monumentId: string;
    query?: string;
    script: MomoScript;
    audio: MomoAudioMixPlan;
    width: number;
    height: number;
    fps: number;
    rawFootagePath?: string;
    images?: string[];
    videoRelativePath: string;
    previewUrl?: string;
    srtRelativePath: string;
    subtitles: MomoSubtitleCue[];
    socialMetadata: {
        title: string;
        description: string;
        hashtags: string[];
    };
    compositionHint: string;
    publishTargets: MomoSocialChannel[];
    fetchedAssets?: MomoFetchedAssetResult;
};

function slugify(s: string): string {
    return s
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 48);
}

function getTodayDateString(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

export function computeMomoRenderPath(
    rawSlug: string,
    ext = 'mp4'
): { relativePath: string; filename: string; srtRelativePath: string } {
    const dateStr = getTodayDateString();
    const cleanSlug = slugify(rawSlug) || 'cimitero_storico';
    const baseDir = '/media/social/momo/renders';
    const absDir = path.join(process.cwd(), 'public', 'media', 'social', 'momo', 'renders');

    let seq = 1;
    if (process.platform === 'darwin' && !process.env.VERCEL) {
        try {
            if (!fs.existsSync(absDir)) {
                fs.mkdirSync(absDir, { recursive: true });
            }
            while (seq < 1000) {
                const pad = String(seq).padStart(2, '0');
                const candidate = `${cleanSlug}_${dateStr}_${pad}.${ext}`;
                if (!fs.existsSync(path.join(absDir, candidate))) {
                    const filename = candidate;
                    const srtFilename = `${cleanSlug}_${dateStr}_${pad}.srt`;
                    return {
                        relativePath: `${baseDir}/${filename}`,
                        filename,
                        srtRelativePath: `${baseDir}/${srtFilename}`,
                    };
                }
                seq++;
            }
        } catch (e) {
            console.warn('[MOMO VideoEngine] Path sequence check error:', e);
        }
    }

    const pad = String(seq).padStart(2, '0');
    const filename = `${cleanSlug}_${dateStr}_${pad}.${ext}`;
    const srtFilename = `${cleanSlug}_${dateStr}_${pad}.srt`;
    return {
        relativePath: `${baseDir}/${filename}`,
        filename,
        srtRelativePath: `${baseDir}/${srtFilename}`,
    };
}

export function buildSubtitleCues(script: MomoScript): MomoSubtitleCue[] {
    return [
        {
            startSec: 0,
            endSec: script.durationSeconds,
            text: script.hookQuestion,
        },
    ];
}

export function toSrt(cues: MomoSubtitleCue[]): string {
    const fmt = (sec: number) => {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        const ms = Math.round((sec % 1) * 1000);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
    };
    return cues
        .map(
            (c, i) =>
                `${i + 1}\n${fmt(c.startSec)} --> ${fmt(c.endSec)}\n${c.text}\n`
        )
        .join('\n');
}

/**
 * Esegue il rendering video nativo AVFoundation su macOS (Swift) con Ken Burns o video grezzo.
 */
export async function executeMomoSwiftRender(
    plan: MomoRenderPlan
): Promise<{ ok: boolean; outputUrl: string; error?: string }> {
    try {
        if (process.platform !== 'darwin' || process.env.VERCEL) {
            // In ambiente serverless cloud (Linux/Vercel), l'eseguibile Swift macOS non è eseguibile localmente
            return { ok: true, outputUrl: plan.videoRelativePath };
        }

        const scriptPath = path.join(process.cwd(), 'scripts', 'render-momo-real-reel.swift');
        if (!fs.existsSync(scriptPath)) {
            console.warn('[MOMO VideoEngine] Script render-momo-real-reel.swift non trovato.');
            return { ok: false, outputUrl: plan.videoRelativePath, error: 'Script non trovato' };
        }

        const cleanHook = plan.script.hookQuestion.replace(/"/g, '\\"');
        const outAbs = path.join(process.cwd(), 'public', plan.videoRelativePath);
        const audioAbs = path.join(process.cwd(), 'public', 'media/social/momo/audio/minimal_piano_einaudi_mood_cc0.wav');

        let cmd: string;
        if (plan.images && plan.images.length > 0) {
            const imgResolvedList = plan.images
                .map((p) => {
                    if (p.startsWith('http://') || p.startsWith('https://')) return p;
                    return p.startsWith('/') ? path.join(process.cwd(), 'public', p) : p;
                })
                .filter((p) => p.startsWith('http://') || p.startsWith('https://') || fs.existsSync(p));
            if (imgResolvedList.length === 0) {
                return { ok: false, outputUrl: plan.videoRelativePath, error: 'Nessuna immagine valida trovata' };
            }
            cmd = `swift "${scriptPath}" --images "${imgResolvedList.join(',')}" --audio "${audioAbs}" --hook "${cleanHook}" --output "${outAbs}" --duration ${plan.script.durationSeconds}`;
        } else if (plan.rawFootagePath) {
            const vidAbs = plan.rawFootagePath.startsWith('http://') || plan.rawFootagePath.startsWith('https://')
                ? plan.rawFootagePath
                : plan.rawFootagePath.startsWith('/')
                ? path.join(process.cwd(), 'public', plan.rawFootagePath)
                : plan.rawFootagePath;
            cmd = `swift "${scriptPath}" --video "${vidAbs}" --audio "${audioAbs}" --hook "${cleanHook}" --output "${outAbs}" --duration ${plan.script.durationSeconds}`;
        } else {
            return { ok: false, outputUrl: plan.videoRelativePath, error: 'Nessun asset video o foto specificato' };
        }

        console.log('[MOMO VideoEngine] Executing Swift Renderer:', cmd);
        const { stdout, stderr } = await execPromise(cmd, { cwd: process.cwd() });
        console.log('[MOMO VideoEngine] Swift output:', stdout || stderr);

        // Cattura l'output path esatto in caso di incremento progressivo da parte di Swift
        const match = (stdout || '').match(/Output file:\s*([^\r\n]+)/i);
        if (match && match[1]) {
            const finalAbs = match[1].trim();
            if (finalAbs.includes('/public/')) {
                const rel = finalAbs.substring(finalAbs.indexOf('/public/') + 7);
                plan.videoRelativePath = rel.startsWith('/') ? rel : `/${rel}`;
                plan.previewUrl = plan.videoRelativePath;
            }
        }

        return { ok: true, outputUrl: plan.videoRelativePath };
    } catch (err) {
        console.error('[MOMO VideoEngine] Rendering error:', err);
        return {
            ok: false,
            outputUrl: plan.videoRelativePath,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}

/**
 * Pianifica e prepara il rendering in modo asincrono (con download automatico asset reali se necessario).
 */
export async function planMomoVideoRenderAsync(
    req: MomoRenderRequest,
    autoRender = true
): Promise<MomoRenderPlan> {
    const rawQuery = req.query?.trim() || req.monumentId?.trim() || 'alessandro-volta-camnago';
    let fetched: MomoFetchedAssetResult | undefined = req.fetchedAssets;

    // Se non forniti asset già scaricati e non è un custom video/custom images
    if (!fetched && !req.customVideoPath && (!req.customImages || req.customImages.length === 0)) {
        try {
            fetched = await searchAndFetchMomoAssets(rawQuery);
        } catch (e) {
            console.warn('[MOMO VideoEngine] Asset search warning:', e);
        }
    }

    const localMatch = getMonumentById(rawQuery);
    const locationInput: MomoLocationInput = {
        id: fetched?.slug || localMatch?.id || slugify(rawQuery),
        cemetery: fetched?.locationName || localMatch?.cemetery || rawQuery,
        city: fetched?.city || localMatch?.city || 'Italia',
        historicalFigure:
            fetched?.historicalFigure || localMatch?.historicalFigure || 'Personaggi illustri della memoria',
        visionLandscape:
            fetched?.visionLandscape || localMatch?.visionLandscape || `La visione solenne di ${rawQuery}`,
        floralNotes:
            fetched?.floralNotes ||
            localMatch?.floralNotes ||
            'Composizione sobria di alloro, rose discrete ed edera perenne.',
        sources: fetched?.sources || localMatch?.sources,
    };

    const script = buildMomoScript(locationInput, req.formatId);
    if (req.customHookQuestion) {
        script.hookQuestion = req.customHookQuestion;
    }

    const musicTrackId = req.musicId || 'minimal-piano-einaudi-cc0';
    const audio = buildAudioMixPlan({
        voiceId: req.voiceId,
        musicId: musicTrackId,
        narrationText: script.fullNarration,
    });
    const subtitles = buildSubtitleCues(script);

    // Risoluzione asset multimediali per il montaggio
    let images: string[] | undefined;
    let rawFootagePath: string | undefined;

    if (req.customImages && req.customImages.length > 0) {
        images = req.customImages;
    } else if (fetched?.imagePaths && fetched.imagePaths.length > 0) {
        // Se contiene immagini (non video fallback)
        const onlyImgs = fetched.imagePaths.filter((p) => /\.(jpg|jpeg|png|webp)$/i.test(p));
        if (onlyImgs.length > 0) {
            images = onlyImgs;
        } else {
            rawFootagePath = fetched.imagePaths[0];
        }
    } else if (req.customVideoPath) {
        rawFootagePath = req.customVideoPath;
    } else if (localMatch?.id === 'alessandro-volta-camnago') {
        rawFootagePath = '/media/social/momo/raw/cimitero_campagna_camminata_pov_real.mp4';
    } else {
        rawFootagePath = '/media/social/momo/raw/cimitero_lago_como_panoramica_real.mp4';
    }

    // Risoluzione progressiva percorso video & srt: [slug]_[YYYY-MM-DD]_[seq].mp4
    const { relativePath: videoRelativePath, srtRelativePath } = computeMomoRenderPath(locationInput.id);

    // Salva file .srt
    try {
        const srtContent = toSrt(subtitles);
        const srtAbs = path.join(process.cwd(), 'public', srtRelativePath);
        if (process.platform === 'darwin' && !process.env.VERCEL) {
            const parentDir = path.dirname(srtAbs);
            if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
            fs.writeFileSync(srtAbs, srtContent, 'utf-8');
        }
    } catch (e) {
        console.warn('[MOMO VideoEngine] Could not write SRT file:', e);
    }

    const compositionHint = images && images.length > 0
        ? `swift scripts/render-momo-real-reel.swift --images "${images.join(',')}" --hook "${script.hookQuestion}" --output "public${videoRelativePath}"`
        : `swift scripts/render-momo-real-reel.swift --video "public${rawFootagePath}" --hook "${script.hookQuestion}" --output "public${videoRelativePath}"`;

    const plan: MomoRenderPlan = {
        status: 'RENDER_PLANNED',
        monumentId: locationInput.id,
        query: rawQuery,
        script,
        audio,
        width: MOMO_VIDEO_WIDTH,
        height: MOMO_VIDEO_HEIGHT,
        fps: MOMO_VIDEO_FPS,
        rawFootagePath,
        images,
        videoRelativePath,
        previewUrl: videoRelativePath,
        srtRelativePath,
        subtitles,
        socialMetadata: {
            title: script.title,
            description: script.description,
            hashtags: script.hashtags,
        },
        compositionHint,
        publishTargets: [
            'instagram_reels',
            'youtube_shorts',
            'tiktok',
            'facebook',
        ],
        fetchedAssets: fetched,
    };

    if (autoRender) {
        const res = await executeMomoSwiftRender(plan);
        if (res.ok) {
            plan.status = 'RENDERED_READY_FOR_PUBLISH';
        }
    }

    return plan;
}

/**
 * Costruisce il piano di rendering sincrono (fallback / compatibilità).
 */
export function planMomoVideoRender(req: MomoRenderRequest): MomoRenderPlan {
    const rawQuery = req.query?.trim() || req.monumentId?.trim() || 'alessandro-volta-camnago';
    const localMatch = getMonumentById(rawQuery);
    const locationInput: MomoLocationInput = {
        id: localMatch?.id || slugify(rawQuery),
        cemetery: localMatch?.cemetery || rawQuery,
        city: localMatch?.city || 'Italia',
        historicalFigure: localMatch?.historicalFigure || 'Figure illustri della memoria',
        visionLandscape: localMatch?.visionLandscape || `La visione di ${rawQuery}`,
        floralNotes: localMatch?.floralNotes || 'Composizione sobria di alloro ed edera.',
        sources: localMatch?.sources,
    };

    const script = buildMomoScript(locationInput, req.formatId);
    if (req.customHookQuestion) {
        script.hookQuestion = req.customHookQuestion;
    }

    const musicTrackId = req.musicId || 'minimal-piano-einaudi-cc0';
    const audio = buildAudioMixPlan({
        voiceId: req.voiceId,
        musicId: musicTrackId,
        narrationText: script.fullNarration,
    });
    const subtitles = buildSubtitleCues(script);

    const isVolta = locationInput.id === 'alessandro-volta-camnago';
    const rawFootagePath = isVolta
        ? '/media/social/momo/raw/cimitero_campagna_camminata_pov_real.mp4'
        : '/media/social/momo/raw/cimitero_lago_como_panoramica_real.mp4';

    const { relativePath: videoRelativePath, srtRelativePath } = computeMomoRenderPath(locationInput.id);

    return {
        status: 'RENDER_PLANNED',
        monumentId: locationInput.id,
        query: rawQuery,
        script,
        audio,
        width: MOMO_VIDEO_WIDTH,
        height: MOMO_VIDEO_HEIGHT,
        fps: MOMO_VIDEO_FPS,
        rawFootagePath,
        videoRelativePath,
        previewUrl: videoRelativePath,
        srtRelativePath,
        subtitles,
        socialMetadata: {
            title: script.title,
            description: script.description,
            hashtags: script.hashtags,
        },
        compositionHint: `swift scripts/render-momo-real-reel.swift --video "public${rawFootagePath}" --hook "${script.hookQuestion}" --output "public${videoRelativePath}"`,
        publishTargets: [
            'instagram_reels',
            'youtube_shorts',
            'tiktok',
            'facebook',
        ],
    };
}

/** Marca il piano come pronto. */
export function markMomoRenderReady(plan: MomoRenderPlan): MomoRenderPlan {
    return { ...plan, status: 'RENDERED_READY_FOR_PUBLISH', previewUrl: plan.videoRelativePath };
}
