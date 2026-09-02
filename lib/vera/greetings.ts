/**
 * Saluti VERA — aperture e chiusure tassative su orario Europe/Rome.
 * Fonte unica per chat WhatsApp e prompt Gemini.
 */

import { ITALY_TIMEZONE } from '@/lib/datetime/italyTimezone';
import { formatPersonName } from '@/lib/utils/formatPersonName';

/** Ora locale Italia (0–23), sempre Europe/Rome. */
export function getVeraItalyHour(now: Date = new Date()): number {
    const hour = parseInt(
        new Intl.DateTimeFormat('it-IT', {
            timeZone: ITALY_TIMEZONE,
            hour: 'numeric',
            hour12: false,
        }).format(now),
        10
    );
    return Number.isFinite(hour) ? hour : new Date().getHours();
}

/** Solo nome di battesimo in Title Case; null se assente/inutile. */
export function normalizeGreetingName(nome?: string | null): string | null {
    const raw = (nome || '').trim();
    if (!raw) return null;
    const formatted = formatPersonName(raw);
    const first = formatted.split(/\s+/).filter(Boolean)[0] || '';
    if (!first) return null;
    const lower = first.toLowerCase();
    if (lower === 'prova' || lower === 'test' || lower === 'cliente' || lower === 'sandbox') {
        return null;
    }
    return first;
}

/**
 * Formula di apertura (senza nome): Buongiorno / Buon pomeriggio / Buona sera.
 * 06–14 · 14–18 · 18–06
 */
export function getOpeningGreetingPhrase(now: Date = new Date()): string {
    const hour = getVeraItalyHour(now);
    if (hour >= 6 && hour < 14) return 'Buongiorno';
    if (hour >= 14 && hour < 18) return 'Buon pomeriggio';
    return 'Buona sera';
}

/**
 * Formula di chiusura (senza nome), senza "a presto".
 * 06–14 · 14–17 · 17–22 · 22–06
 */
export function getClosingGreetingPhrase(now: Date = new Date()): string {
    const hour = getVeraItalyHour(now);
    if (hour >= 6 && hour < 14) return 'Buona giornata';
    if (hour >= 14 && hour < 17) return 'Buon pomeriggio';
    if (hour >= 17 && hour < 22) return 'Buona serata';
    return 'Buona notte';
}

/**
 * Saluto di apertura: "Buongiorno [Nome]," oppure "Buongiorno," se nome assente.
 */
export function getOpeningGreeting(nome?: string | null, now: Date = new Date()): string {
    const phrase = getOpeningGreetingPhrase(now);
    const name = normalizeGreetingName(nome);
    return name ? `${phrase} ${name},` : `${phrase},`;
}

/**
 * Congedo: "Buona giornata [Nome], a presto." oppure senza nome.
 */
export function getClosingGreeting(nome?: string | null, now: Date = new Date()): string {
    const phrase = getClosingGreetingPhrase(now);
    const name = normalizeGreetingName(nome);
    return name ? `${phrase} ${name}, a presto.` : `${phrase}, a presto.`;
}

/** Blocco prompt coercitivo per Gemini (allineato alle fasce VERA). */
export function buildVeraGreetingPromptRule(now: Date = new Date()): string {
    const hour = getVeraItalyHour(now);
    const opening = getOpeningGreetingPhrase(now);
    const closing = getClosingGreetingPhrase(now);
    return [
        '=== SALUTO ORARIO VERA (Europe/Rome, TASSAZIONE) ===',
        `Ora Italia: circa le ${String(hour).padStart(2, '0')}:00.`,
        `Apertura consentita ORA: "${opening}" (con nome di battesimo Title Case se noto).`,
        `Chiusura consentita ORA: "${closing} …, a presto."`,
        'Fasce apertura: 06–14 Buongiorno · 14–18 Buon pomeriggio · 18–06 Buona sera.',
        'Fasce chiusura: 06–14 Buona giornata · 14–17 Buon pomeriggio · 17–22 Buona serata · 22–06 Buona notte.',
        'VIETATO: "Buongiorno" di sera; "Buona sera" al mattino; "Buona giornata" dopo le 17.',
        'Non ripetere il saluto se la conversazione è già aperta e il cliente non ha salutato.',
    ].join('\n');
}
