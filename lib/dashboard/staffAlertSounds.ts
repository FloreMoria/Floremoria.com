export type StaffAlertSound = 'whatsapp' | 'order' | 'floristPhoto';

let audioContext: AudioContext | null = null;

export function unlockStaffAlertSounds(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return false;
        if (!audioContext) {
            audioContext = new Ctx();
        }
        if (audioContext.state === 'suspended') {
            void audioContext.resume();
        }
        return audioContext.state === 'running' || audioContext.state === 'suspended';
    } catch {
        return false;
    }
}

export function areStaffAlertSoundsUnlocked(): boolean {
    return Boolean(audioContext && audioContext.state === 'running');
}

function playTone(
    frequency: number,
    startOffsetSec: number,
    durationSec: number,
    volume = 0.28
): void {
    if (!audioContext) return;

    const startAt = audioContext.currentTime + startOffsetSec;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSec);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + durationSec + 0.02);
}

/** Doppio tono stile notifica chat (WhatsApp). */
function playWhatsAppSound(): void {
    playTone(880, 0, 0.11, 0.3);
    playTone(1174.66, 0.12, 0.14, 0.28);
}

/** Ding breve per nuovo ordine pagato. */
function playOrderSound(): void {
    playTone(659.25, 0, 0.18, 0.32);
    playTone(783.99, 0.16, 0.22, 0.26);
}

/** Tre note ascendenti per foto fiorista. */
function playFloristPhotoSound(): void {
    playTone(523.25, 0, 0.09, 0.24);
    playTone(659.25, 0.1, 0.09, 0.24);
    playTone(783.99, 0.2, 0.16, 0.28);
}

export function playStaffAlertSound(sound: StaffAlertSound): void {
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem('fm_staff_sounds_muted') === '1') return;

    unlockStaffAlertSounds();
    if (!audioContext) return;

    try {
        switch (sound) {
            case 'whatsapp':
                playWhatsAppSound();
                break;
            case 'order':
                playOrderSound();
                break;
            case 'floristPhoto':
                playFloristPhotoSound();
                break;
        }
    } catch {
        /* autoplay o AudioContext non disponibile */
    }
}

export function setStaffAlertSoundsMuted(muted: boolean): void {
    if (typeof window === 'undefined') return;
    if (muted) {
        window.localStorage.setItem('fm_staff_sounds_muted', '1');
    } else {
        window.localStorage.removeItem('fm_staff_sounds_muted');
        unlockStaffAlertSounds();
    }
}

export function areStaffAlertSoundsMuted(): boolean {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('fm_staff_sounds_muted') === '1';
}
