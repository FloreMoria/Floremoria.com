import { ITALY_TIMEZONE } from '@/lib/datetime/italyTimezone';
import { getItalyMinutesSinceMidnight } from '@/lib/datetime/floristNotifyWindow';

/** Fascia diurna legacy (solo senza paidAt): creazione 08:00–18:59 → invio differito. */
export const CUSTOMER_CONFIRM_DAY_START_MINUTES = 8 * 60; // 08:00
export const CUSTOMER_CONFIRM_DAY_END_MINUTES = 19 * 60; // 19:00 (escluso)
/** Post-pagamento: conferma utente a +60 secondi esatti. */
export const CUSTOMER_CONFIRM_DELAY_MS = 60 * 1000;
/** Legacy dashboard / senza paidAt: mantiene il ritardo storico di 30 minuti. */
export const CUSTOMER_CONFIRM_LEGACY_DELAY_MS = 30 * 60 * 1000;
export const CUSTOMER_CONFIRM_MORNING_HOUR = 8;
export const CUSTOMER_CONFIRM_MORNING_MINUTE = 30;

type ItalyDateParts = {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
};

function getItalyDateParts(at: Date): ItalyDateParts {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: ITALY_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(at);

    const read = (type: Intl.DateTimeFormatPartTypes) =>
        Number(parts.find((p) => p.type === type)?.value ?? '0');

    return {
        year: read('year'),
        month: read('month'),
        day: read('day'),
        hour: read('hour'),
        minute: read('minute'),
        second: read('second'),
    };
}

/**
 * Converte data/ora civile Europe/Rome in istante UTC.
 * Perché: lo scheduling Punto B deve rispettare 08:30 Italia, non UTC del runtime Vercel.
 */
export function italyWallTimeToUtc(input: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second?: number;
}): Date {
    const second = input.second ?? 0;
    // Guess CET (UTC+1), poi converge confrontando le parti Italy.
    let utcMs = Date.UTC(input.year, input.month - 1, input.day, input.hour - 1, input.minute, second);

    for (let i = 0; i < 6; i += 1) {
        const got = getItalyDateParts(new Date(utcMs));
        const gotAsUtc = Date.UTC(got.year, got.month - 1, got.day, got.hour, got.minute, got.second);
        const wantAsUtc = Date.UTC(
            input.year,
            input.month - 1,
            input.day,
            input.hour,
            input.minute,
            second
        );
        const diffMs = wantAsUtc - gotAsUtc;
        if (Math.abs(diffMs) < 500) break;
        utcMs += diffMs;
    }

    return new Date(utcMs);
}

/** Prossimo (o odierno) 08:30 Europe/Rome rispetto a `from`. */
export function nextItalyMorning0830(from: Date = new Date()): Date {
    const parts = getItalyDateParts(from);
    const today0830 = italyWallTimeToUtc({
        year: parts.year,
        month: parts.month,
        day: parts.day,
        hour: CUSTOMER_CONFIRM_MORNING_HOUR,
        minute: CUSTOMER_CONFIRM_MORNING_MINUTE,
    });

    if (from.getTime() < today0830.getTime()) {
        return today0830;
    }

    const tomorrowProbe = new Date(today0830.getTime() + 36 * 60 * 60 * 1000);
    const t = getItalyDateParts(tomorrowProbe);
    return italyWallTimeToUtc({
        year: t.year,
        month: t.month,
        day: t.day,
        hour: CUSTOMER_CONFIRM_MORNING_HOUR,
        minute: CUSTOMER_CONFIRM_MORNING_MINUTE,
    });
}

export function isCustomerConfirmDayWindow(at: Date = new Date()): boolean {
    const minutes = getItalyMinutesSinceMidnight(at);
    return (
        minutes >= CUSTOMER_CONFIRM_DAY_START_MINUTES && minutes < CUSTOMER_CONFIRM_DAY_END_MINUTES
    );
}

/**
 * Calcola l'istante di invio Punto B / email cliente.
 * - Sandbox (`isTest`): immediato.
 * - Con `paidAt` (post-pagamento Stripe/ricorrenza): paidAt + 60 secondi.
 * - Legacy senza paidAt: createdAt + 30 min (giorno) o 08:30 (notte).
 */
export function computeCustomerConfirmSendAt(input: {
    createdAt: Date;
    paidAt?: Date | null;
    isTest?: boolean | null;
    now?: Date;
}): Date {
    const now = input.now ?? new Date();
    if (input.isTest) {
        return now;
    }

    if (input.paidAt) {
        return new Date(input.paidAt.getTime() + CUSTOMER_CONFIRM_DELAY_MS);
    }

    if (isCustomerConfirmDayWindow(input.createdAt)) {
        return new Date(input.createdAt.getTime() + CUSTOMER_CONFIRM_LEGACY_DELAY_MS);
    }

    return nextItalyMorning0830(input.createdAt);
}

export function isCustomerConfirmSendDue(sendAt: Date, now: Date = new Date()): boolean {
    return now.getTime() >= sendAt.getTime();
}
