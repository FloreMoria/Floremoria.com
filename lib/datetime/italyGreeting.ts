/**
 * Saluti WhatsApp/VERA ancorati all'orario Europe/Rome.
 * Delega a lib/vera/greetings.ts (fonte unica fasce orarie).
 */
import {
    buildVeraGreetingPromptRule,
    getClosingGreetingPhrase,
    getOpeningGreetingPhrase,
    getVeraItalyHour,
} from '@/lib/vera/greetings';

export type ItalyDayPart = 'morning' | 'afternoon' | 'evening' | 'night';

export function getItalyHour(now: Date = new Date()): number {
    return getVeraItalyHour(now);
}

export function getItalyDayPart(now: Date = new Date()): ItalyDayPart {
    const hour = getItalyHour(now);
    if (hour >= 6 && hour < 14) return 'morning';
    if (hour >= 14 && hour < 18) return 'afternoon';
    if (hour >= 18 && hour <= 23) return 'evening';
    return 'night';
}

/** Saluto di apertura senza nome ("Buongiorno" / "Buon pomeriggio" / "Buona sera"). */
export function getItalyOpeningGreeting(now: Date = new Date()): string {
    return getOpeningGreetingPhrase(now);
}

/** Congedo senza nome ("Buona giornata" / … / "Buona notte"). */
export function getItalyClosingWish(now: Date = new Date()): string {
    return getClosingGreetingPhrase(now);
}

/** Blocco prompt coercitivo per Gemini. */
export function buildItalyGreetingPromptRule(now: Date = new Date()): string {
    return buildVeraGreetingPromptRule(now);
}
