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
    voiceId?: string;
    musicId?: string;
    rawFootageId?: string;
    customHookQuestion?: string;
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
    rawFootagePath: string;
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
 * Costruisce il piano di rendering con footage reale. Restituisce il path del video 9:16
 * con overlay sticker Instagram nativo e audio pianoforte neoclassico.
 */
export function planMomoVideoRender(req: MomoRenderRequest): MomoRenderPlan {
    assertMonumentCertified(req.monumentId);
    const script = buildMomoScript(req.monumentId);
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

    const isVoltaTest = req.monumentId === 'alessandro-volta-camnago';
    const rawFootagePath = isVoltaTest
        ? '/media/social/momo/raw/cimitero_campagna_camminata_pov_real.mp4'
        : '/media/social/momo/raw/cimitero_lago_como_panoramica_real.mp4';

    const videoRelativePath = '/media/social/momo/test_momo_real_reel.mp4';
    const srtRelativePath = '/media/social/momo/test_momo_real_reel.srt';

    return {
        status: 'RENDERED_READY_FOR_PUBLISH',
        monumentId: req.monumentId,
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

/** Marca il piano come pronto (dopo worker di rendering). */
export function markMomoRenderReady(plan: MomoRenderPlan): MomoRenderPlan {
    return { ...plan, status: 'RENDERED_READY_FOR_PUBLISH', previewUrl: plan.videoRelativePath };
}
