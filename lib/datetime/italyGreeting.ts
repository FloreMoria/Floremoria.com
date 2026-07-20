/**
 * Saluti WhatsApp/VERA ancorati all'orario Europe/Rome.
 * 06:00–14:59 → Buongiorno / Buona giornata
 * 15:00–23:59 → Buonasera / Buona serata
 * 00:00–05:59 → Buonanotte / Buona notte
 */
import { ITALY_TIMEZONE } from '@/lib/datetime/italyTimezone';

export type ItalyDayPart = 'morning' | 'evening' | 'night';

export function getItalyHour(now: Date = new Date()): number {
    const hourStr = new Intl.DateTimeFormat('en-GB', {
        timeZone: ITALY_TIMEZONE,
        hour: '2-digit',
        hour12: false,
    }).format(now);
    return Number.parseInt(hourStr, 10);
}

export function getItalyDayPart(now: Date = new Date()): ItalyDayPart {
    const hour = getItalyHour(now);
    if (hour >= 6 && hour < 15) return 'morning';
    if (hour >= 15 && hour <= 23) return 'evening';
    return 'night';
}

/** Saluto di apertura ("Buongiorno" / "Buonasera" / "Buonanotte"). */
export function getItalyOpeningGreeting(now: Date = new Date()): string {
    const part = getItalyDayPart(now);
    if (part === 'morning') return 'Buongiorno';
    if (part === 'evening') return 'Buonasera';
    return 'Buonanotte';
}

/** Congedo ("Buona giornata" / "Buona serata" / "Buona notte"). */
export function getItalyClosingWish(now: Date = new Date()): string {
    const part = getItalyDayPart(now);
    if (part === 'morning') return 'Buona giornata';
    if (part === 'evening') return 'Buona serata';
    return 'Buona notte';
}

/** Blocco prompt coercitivo per Gemini. */
export function buildItalyGreetingPromptRule(now: Date = new Date()): string {
    const opening = getItalyOpeningGreeting(now);
    const closing = getItalyClosingWish(now);
    const hour = getItalyHour(now);
    return [
        '=== SALUTO ORARIO (Europe/Rome, TASSAZIONE) ===',
        `Ora server Italia: circa le ${String(hour).padStart(2, '0')}:00.`,
        `Se saluti in apertura, usa SOLO "${opening}" (mai gli altri).`,
        `Se chiudi con un augurio, usa SOLO "${closing}".`,
        'VIETATO: "Buongiorno" dopo le 15:00; "Buonasera" al mattino; "Buona giornata" la sera.',
        'Non salutare di nuovo se la conversazione è già aperta e il cliente non ha salutato.',
    ].join('\n');
}
