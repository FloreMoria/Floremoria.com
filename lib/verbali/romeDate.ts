/** Date calendariali in Europe/Rome (en-CA → YYYY-MM-DD). */

export function isoTodayRome(now = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Rome',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(now);
}

/** Giorno precedente rispetto a oggi (o a `iso`) nel fuso Europe/Rome. */
export function isoYesterdayRome(fromIso?: string): string {
    const today = fromIso && /^\d{4}-\d{2}-\d{2}$/.test(fromIso) ? fromIso : isoTodayRome();
    const [y, m, d] = today.split('-').map(Number);
    const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    anchor.setUTCDate(anchor.getUTCDate() - 1);
    const yy = anchor.getUTCFullYear();
    const mm = String(anchor.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(anchor.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
}
