/**
 * Scadenza consegna nel messaggio d'incarico fiorista (Punto A).
 * Preferisce deliveryDate / requestedDeliveryDate; altrimenti createdAt + 48h.
 */

const TZ = 'Europe/Rome';

const WEEKDAYS_IT = [
    'Domenica',
    'Lunedì',
    'Martedì',
    'Mercoledì',
    'Giovedì',
    'Venerdì',
    'Sabato',
] as const;

const MONTHS_IT = [
    'Gennaio',
    'Febbraio',
    'Marzo',
    'Aprile',
    'Maggio',
    'Giugno',
    'Luglio',
    'Agosto',
    'Settembre',
    'Ottobre',
    'Novembre',
    'Dicembre',
] as const;

function toValidDate(value: Date | string | null | undefined): Date | null {
    if (value == null || value === '') return null;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

function romeParts(date: Date): {
    weekday: number;
    day: number;
    month: number;
    year: number;
    hour: number;
    minute: number;
} {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: TZ,
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(date);

    const get = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((p) => p.type === type)?.value || '';

    const weekdayMap: Record<string, number> = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
    };

    return {
        weekday: weekdayMap[get('weekday')] ?? date.getDay(),
        day: Number(get('day')),
        month: Number(get('month')),
        year: Number(get('year')),
        hour: Number(get('hour')),
        minute: Number(get('minute')),
    };
}

/** True se in Europe/Rome l'orario è mezzanotte (tipico date-only). */
function isMidnightRome(date: Date): boolean {
    const { hour, minute } = romeParts(date);
    return hour === 0 && minute === 0;
}

export type FloristDeliveryDeadlineSource = 'deliveryDate' | 'fallback_48h';

export type FloristDeliveryDeadlineResult = {
    deadline: Date;
    source: FloristDeliveryDeadlineSource;
    /** Etichetta completa per WhatsApp, senza prefisso emoji. */
    label: string;
    /** Riga pronta: `📅 CONSEGNA ENTRO: …` */
    messageLine: string;
};

/**
 * Formatta: "Lunedì 03 Agosto 2026 entro le ore 12:00"
 * Per date-only (mezzanotte Rome) usa le 12:00; altrimenti l'orario reale.
 */
export function formatFloristDeliveryDeadlineIt(
    deadline: Date,
    options?: { forceNoonIfMidnight?: boolean }
): string {
    const forceNoon = options?.forceNoonIfMidnight !== false;
    const p = romeParts(deadline);
    const hour = forceNoon && isMidnightRome(deadline) ? 12 : p.hour;
    const minute = forceNoon && isMidnightRome(deadline) ? 0 : p.minute;
    const day = String(p.day).padStart(2, '0');
    const hh = String(hour).padStart(2, '0');
    const mm = String(minute).padStart(2, '0');
    const weekday = WEEKDAYS_IT[p.weekday] || 'Giorno';
    const month = MONTHS_IT[p.month - 1] || 'Mese';
    return `${weekday} ${day} ${month} ${p.year} entro le ore ${hh}:${mm}`;
}

export function resolveFloristDeliveryDeadline(input: {
    deliveryDate?: Date | string | null;
    requestedDeliveryDate?: Date | string | null;
    createdAt?: Date | string | null;
}): FloristDeliveryDeadlineResult {
    const fromDelivery =
        toValidDate(input.deliveryDate) || toValidDate(input.requestedDeliveryDate);

    if (fromDelivery) {
        const label = formatFloristDeliveryDeadlineIt(fromDelivery);
        return {
            deadline: fromDelivery,
            source: 'deliveryDate',
            label,
            messageLine: `📅 CONSEGNA ENTRO: ${label}`,
        };
    }

    const created = toValidDate(input.createdAt) || new Date();
    const deadline = new Date(created.getTime() + 48 * 60 * 60 * 1000);
    const label = formatFloristDeliveryDeadlineIt(deadline, { forceNoonIfMidnight: false });
    return {
        deadline,
        source: 'fallback_48h',
        label,
        messageLine: `📅 CONSEGNA ENTRO: ${label}`,
    };
}
