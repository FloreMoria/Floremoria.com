import type { OrderCancellationCause, OrderStatus } from '@prisma/client';

/** Fee QR considerata nei totali prospetto (Art. 3.3). */
export function isQrFeeEligibleForTotals(order: {
    isTest?: boolean | null;
    status?: OrderStatus | string | null;
    cancellationCause?: OrderCancellationCause | string | null;
    deletedAt?: Date | string | null;
}): boolean {
    if (order.deletedAt) return false;
    if (order.isTest) return false;
    if (order.status === 'CANCELLED') {
        const cause = order.cancellationCause;
        // Art. 3.3: esclusi annullamenti per scelta cliente o errore fiorista.
        if (cause === 'CUSTOMER' || cause === 'FLORIST') return false;
        // Altri annullamenti: non maturano fee nel prospetto.
        return false;
    }
    return true;
}

export type QrFeeStatusKind =
    | 'valid'
    | 'excluded_test'
    | 'excluded_cancelled_customer'
    | 'excluded_cancelled_florist'
    | 'excluded_cancelled'
    | 'none';

/**
 * Stato fee per UI admin (drawer + prospetto).
 * Perché: tracciare sempre la fee anche su test/annullati; i totali usano isQrFeeEligibleForTotals.
 */
export function resolveQrFeeStatus(order: {
    isTest?: boolean | null;
    status?: OrderStatus | string | null;
    cancellationCause?: OrderCancellationCause | string | null;
    referralFeeCents?: number | null;
    deletedAt?: Date | string | null;
}): { kind: QrFeeStatusKind; label: string } {
    // Test ha priorità: anche se cancellationCause=FLOREMORIA dopo marca-test.
    if (order.isTest) {
        return { kind: 'excluded_test', label: 'escluso – test' };
    }
    if (order.status === 'CANCELLED') {
        if (order.cancellationCause === 'CUSTOMER') {
            return { kind: 'excluded_cancelled_customer', label: 'escluso – annullato cliente' };
        }
        if (order.cancellationCause === 'FLORIST') {
            return { kind: 'excluded_cancelled_florist', label: 'escluso – annullato fiorista' };
        }
        if (order.cancellationCause === 'FLOREMORIA') {
            return { kind: 'excluded_cancelled', label: 'escluso – annullato FloreMoria' };
        }
        return { kind: 'excluded_cancelled', label: 'escluso – annullato' };
    }
    if ((order.referralFeeCents ?? 0) > 0) {
        return { kind: 'valid', label: 'valida' };
    }
    return { kind: 'none', label: 'nessuna fee' };
}

export function formatEuroFromCents(cents: number): string {
    return new Intl.NumberFormat('it-IT', {
        style: 'currency',
        currency: 'EUR',
    }).format((cents || 0) / 100);
}

export function monthBoundsUtc(year: number, monthIndex0: number): { start: Date; end: Date } {
    const start = new Date(Date.UTC(year, monthIndex0, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, monthIndex0 + 1, 1, 0, 0, 0, 0));
    return { start, end };
}

/** Mese corrente e precedente in Europe/Rome (anno/mese calendariali). */
export function currentAndPreviousMonthRome(now = new Date()): {
    current: { year: number; monthIndex0: number; label: string };
    previous: { year: number; monthIndex0: number; label: string };
} {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Rome',
        year: 'numeric',
        month: '2-digit',
    }).formatToParts(now);
    const year = Number(parts.find((p) => p.type === 'year')?.value);
    const month = Number(parts.find((p) => p.type === 'month')?.value); // 1-12
    const monthIndex0 = month - 1;
    const prev = new Date(Date.UTC(year, monthIndex0 - 1, 1));
    const prevYear = prev.getUTCFullYear();
    const prevMonthIndex0 = prev.getUTCMonth();
    const labelFor = (y: number, m0: number) =>
        new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
            new Date(Date.UTC(y, m0, 1))
        );
    return {
        current: { year, monthIndex0, label: labelFor(year, monthIndex0) },
        previous: { year: prevYear, monthIndex0: prevMonthIndex0, label: labelFor(prevYear, prevMonthIndex0) },
    };
}

export function floristPublicQrUrl(slug: string): string {
    return `https://www.floremoria.com/fioristi/${encodeURIComponent(slug)}`;
}
