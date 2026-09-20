/**
 * MOMO video engine — struttura rendering MP4 1080×1920 + sottotitoli.
 * Assumption: in produzione il job usa FFmpeg/Remotion; qui si produce il piano
 * di composizione e un percorso output deterministico sotto public/media/social/momo.
 */
import path from 'node:path';
import { buildMomoScript, type MomoScript } from '@/lib/ai/momo/momoStoryteller';
import {
    buildAudioMixPlan,
    type MomoAudioMixPlan,
} from '@/lib/ai/momo/momoVoiceAudio';
import { assertMonumentCertified } from '@/lib/ai/momo/momoMonuments';

export const MOMO_VIDEO_WIDTH = 1080;
export const MOMO_VIDEO_HEIGHT = 1920;
export const MOMO_VIDEO_FPS = 30;

export type MomoSocialChannel =
    | 'youtube_shorts'
    | 'instagram_reels'
    | 'tiktok'
    | 'facebook';

export type MomoRenderRequest = {
    monumentId: string;
    voiceId: string;
    musicId: string;
};

export type MomoSubtitleCue = {
    startSec: number;
    endSec: number;
    text: string;
};

export type MomoRenderPlan = {
    status: 'RENDER_PLANNED' | 'RENDERED_READY_FOR_PUBLISH';
    monumentId: string;
    script: MomoScript;
    audio: MomoAudioMixPlan;
    width: number;
    height: number;
    fps: number;
    videoRelativePath: string;
    srtRelativePath: string;
    subtitles: MomoSubtitleCue[];
    socialMetadata: {
        title: string;
        description: string;
        hashtags: string[];
    };
    ffmpegHint: string;
    publishTargets: MomoSocialChannel[];
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

export function buildSubtitleCues(script: MomoScript): MomoSubtitleCue[] {
    return script.blocks.map((b) => ({
        startSec: b.startSec,
        endSec: b.endSec,
        text: b.narration,
    }));
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
 * Costruisce il piano di rendering. Non esegue FFmpeg in-process (evita dipendenze
 * native in serverless); restituisce path e hint per job/worker.
 */
export function planMomoVideoRender(req: MomoRenderRequest): MomoRenderPlan {
    assertMonumentCertified(req.monumentId);
    const script = buildMomoScript(req.monumentId);
    const audio = buildAudioMixPlan({
        voiceId: req.voiceId,
        musicId: req.musicId,
        narrationText: script.fullNarration,
    });
    const subtitles = buildSubtitleCues(script);
    const base = `${slugify(script.historicalFigure)}_${Date.now()}`;
    const videoRelativePath = `/media/social/momo/${base}_9_16.mp4`;
    const srtRelativePath = `/media/social/momo/${base}.srt`;

    return {
        status: 'RENDER_PLANNED',
        monumentId: req.monumentId,
        script,
        audio,
        width: MOMO_VIDEO_WIDTH,
        height: MOMO_VIDEO_HEIGHT,
        fps: MOMO_VIDEO_FPS,
        videoRelativePath,
        srtRelativePath,
        subtitles,
        socialMetadata: {
            title: script.title,
            description: script.description,
            hashtags: script.hashtags,
        },
        ffmpegHint: [
            'ffmpeg -y',
            `-f lavfi -i color=c=0x2a2a2a:s=${MOMO_VIDEO_WIDTH}x${MOMO_VIDEO_HEIGHT}:d=${script.durationSeconds}`,
            `-i "${path.basename(audio.music.assetPath)}"`,
            `-vf "subtitles=${path.basename(srtRelativePath)}"`,
            `-c:v libx264 -pix_fmt yuv420p -r ${MOMO_VIDEO_FPS}`,
            `-c:a aac -shortest`,
            path.basename(videoRelativePath),
        ].join(' '),
        publishTargets: [
            'youtube_shorts',
            'instagram_reels',
            'tiktok',
            'facebook',
        ],
    };
}

/** Marca il piano come pronto (dopo worker FFmpeg esterno). */
export function markMomoRenderReady(plan: MomoRenderPlan): MomoRenderPlan {
    return { ...plan, status: 'RENDERED_READY_FOR_PUBLISH' };
}
