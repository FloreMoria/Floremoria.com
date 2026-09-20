/**
 * MOMO voice & audio — profili vocali multi-timbro + tracce copyright-free con ducking.
 */
export type MomoVoiceGender = 'male' | 'female';
export type MomoVoiceAge = 'young' | 'mid' | 'senior';

export type MomoVoiceProfile = {
    id: string;
    label: string;
    gender: MomoVoiceGender;
    age: MomoVoiceAge;
    /** Fattore velocità TTS / lettura (1 = normale). */
    speed: number;
    tone: string;
};

export type MomoMusicTrack = {
    id: string;
    title: string;
    /** Solo licenze libere da Content ID aggressivo. */
    license: 'CC0' | 'CC-BY';
    mood: 'neoclassical' | 'piano' | 'strings' | 'drone';
    /** Path relativo sotto public/ o URL blob; placeholder se assente. */
    assetPath: string;
};

export const MOMO_VOICE_PROFILES: MomoVoiceProfile[] = [
    {
        id: 'male-senior',
        label: 'Maschile maturo — autorevole',
        gender: 'male',
        age: 'senior',
        speed: 0.95,
        tone: 'profondo, solenne',
    },
    {
        id: 'female-mid',
        label: 'Femminile mezza età — calda',
        gender: 'female',
        age: 'mid',
        speed: 1.0,
        tone: 'empatica, misurata',
    },
    {
        id: 'female-young',
        label: 'Femminile giovane — limpida',
        gender: 'female',
        age: 'young',
        speed: 1.02,
        tone: 'riflessiva, chiara',
    },
    {
        id: 'male-mid',
        label: 'Maschile mezza età — sobrio',
        gender: 'male',
        age: 'mid',
        speed: 0.98,
        tone: 'posato, documentaristico',
    },
];

export const MOMO_MUSIC_LIBRARY: MomoMusicTrack[] = [
    {
        id: 'adagio-strings-cc0',
        title: 'Adagio Strings (CC0)',
        license: 'CC0',
        mood: 'strings',
        assetPath: '/media/social/momo/audio/adagio_strings_cc0.mp3',
    },
    {
        id: 'minimal-piano-cc0',
        title: 'Minimal Piano (CC0)',
        license: 'CC0',
        mood: 'piano',
        assetPath: '/media/social/momo/audio/minimal_piano_cc0.mp3',
    },
    {
        id: 'soft-drone-cc0',
        title: 'Soft Drone (CC0)',
        license: 'CC0',
        mood: 'drone',
        assetPath: '/media/social/momo/audio/soft_drone_cc0.mp3',
    },
];

/** Ducking tipico sotto voce narrante (−18 dB). */
export const MOMO_MUSIC_DUCKING_DB = -18;

export function resolveVoiceProfile(id: string): MomoVoiceProfile {
    const found = MOMO_VOICE_PROFILES.find((v) => v.id === id);
    if (!found) {
        throw new Error(`MOMO: profilo vocale sconosciuto (${id})`);
    }
    return found;
}

export function resolveMusicTrack(id: string): MomoMusicTrack {
    const found = MOMO_MUSIC_LIBRARY.find((t) => t.id === id);
    if (!found) {
        throw new Error(`MOMO: traccia musicale sconosciuta (${id})`);
    }
    if (found.license !== 'CC0' && found.license !== 'CC-BY') {
        throw new Error('MOMO STOP: traccia non royalty-free');
    }
    return found;
}

export type MomoAudioMixPlan = {
    voice: MomoVoiceProfile;
    music: MomoMusicTrack;
    duckingDb: number;
    narrationText: string;
    notes: string;
};

export function buildAudioMixPlan(input: {
    voiceId: string;
    musicId: string;
    narrationText: string;
}): MomoAudioMixPlan {
    const voice = resolveVoiceProfile(input.voiceId);
    const music = resolveMusicTrack(input.musicId);
    return {
        voice,
        music,
        duckingDb: MOMO_MUSIC_DUCKING_DB,
        narrationText: input.narrationText,
        notes: `Mix: voce ${voice.label} @ speed ${voice.speed}; musica ${music.title} ducking ${MOMO_MUSIC_DUCKING_DB} dB.`,
    };
}
