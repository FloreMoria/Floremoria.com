import { ITALY_TIMEZONE } from '@/lib/datetime/italyTimezone';

/** Fascia operativa invio cascata WhatsApp fiorista (Punto A). */
export const FLORIST_NOTIFY_WINDOW_START_MINUTES = 8 * 60 + 30; // 08:30
export const FLORIST_NOTIFY_WINDOW_END_MINUTES = 19 * 60 + 30; // 19:30

/**
 * Minuti da mezzanotte in Europe/Rome.
 * Perché: la fascia 8:30–19:30 è operativa Italia, indipendente da UTC del runtime Vercel.
 */
export function getItalyMinutesSinceMidnight(at: Date = new Date()): number {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: ITALY_TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(at);

    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    return hour * 60 + minute;
}

/** True se `at` cade nella fascia inclusiva 08:30–19:30 Europe/Rome. */
export function isWithinFloristNotifyWindow(at: Date = new Date()): boolean {
    const minutes = getItalyMinutesSinceMidnight(at);
    return (
        minutes >= FLORIST_NOTIFY_WINDOW_START_MINUTES &&
        minutes <= FLORIST_NOTIFY_WINDOW_END_MINUTES
    );
}
