/** Fuso orario operativo FloreMoria (WhatsApp, VERA, dashboard comunicazioni). */
export const ITALY_TIMEZONE = 'Europe/Rome';

const ITALY_LOCALE = 'it-IT';

function toDate(value: Date | string | number): Date {
    return value instanceof Date ? value : new Date(value);
}

export function formatItalyTime(value: Date | string | number = new Date()): string {
    return toDate(value).toLocaleTimeString(ITALY_LOCALE, {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: ITALY_TIMEZONE,
    });
}

export function formatItalyDate(value: Date | string | number = new Date()): string {
    return toDate(value).toLocaleDateString(ITALY_LOCALE, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: ITALY_TIMEZONE,
    });
}

export function formatItalyDateTime(
    value: Date | string | number = new Date(),
    options: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' }
): string {
    return toDate(value).toLocaleString(ITALY_LOCALE, {
        ...options,
        timeZone: ITALY_TIMEZONE,
    });
}

/** Imposta TZ lato runtime Node (Vercel serverless) se non già configurato. */
export function ensureItalyProcessTimezone(): void {
    if (process.env.TZ !== ITALY_TIMEZONE) {
        process.env.TZ = ITALY_TIMEZONE;
    }
}
