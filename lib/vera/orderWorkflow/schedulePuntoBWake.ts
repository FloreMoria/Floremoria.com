/**
 * Schedula il flush Punto B senza cron sub-giornaliero (Vercel Hobby = 1×/giorno).
 * Catena di auto-wake HTTP: ogni hop attende fino a ~50s, poi si richiama fino a sendAt.
 */
import { after } from 'next/server';

const WAKE_PATH = '/api/cron/punto-b-wake';
/** Sotto il maxDuration tipico (60s) per lasciare margine alla risposta. */
const MAX_SLEEP_MS = 50_000;

function appBaseUrl(): string | null {
    const fromEnv =
        process.env.NEXT_PUBLIC_APP_URL?.trim() ||
        process.env.APP_URL?.trim() ||
        (process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
            ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.trim()}`
            : '');
    if (fromEnv) return fromEnv.replace(/\/$/, '');
    if (process.env.VERCEL_URL?.trim()) {
        return `https://${process.env.VERCEL_URL.trim().replace(/^https?:\/\//, '')}`;
    }
    return null;
}

function cronAuthHeaders(): HeadersInit | null {
    const secret =
        process.env.CRON_SECRET?.trim() || process.env.POSTMAN_CRON_SECRET?.trim();
    if (!secret) return null;
    return { Authorization: `Bearer ${secret}` };
}

export function sleepMs(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

export function computeWakeSleepMs(sendAt: Date, now: Date = new Date()): number {
    const remaining = sendAt.getTime() - now.getTime();
    if (remaining <= 0) return 0;
    return Math.min(remaining, MAX_SLEEP_MS);
}

/** Invoca subito l'endpoint wake (un hop della catena). */
export async function triggerPuntoBWakeNow(input: {
    orderId: string;
    sendAt: Date;
}): Promise<void> {
    const base = appBaseUrl();
    const headers = cronAuthHeaders();
    if (!base || !headers) {
        console.warn(
            '[vera-workflow] Wake Punto B non avviato: manca APP_URL/VERCEL_URL o CRON_SECRET'
        );
        return;
    }

    const url = new URL(WAKE_PATH, `${base}/`);
    url.searchParams.set('orderId', input.orderId);
    url.searchParams.set('sendAt', input.sendAt.toISOString());

    const res = await fetch(url.toString(), {
        method: 'GET',
        headers,
        cache: 'no-store',
    });
    if (!res.ok) {
        console.error(
            `[vera-workflow] Wake Punto B HTTP ${res.status} ordine ${input.orderId}`
        );
    }
}

/**
 * Avvia (fire-and-forget) la catena di wake per un ordine con Punto B differito.
 * Perché: su Hobby non possiamo usare cron ogni 5 minuti; senza wake i +30 min restano al flush 06:30.
 */
export function enqueuePuntoBWake(input: {
    orderId: string;
    sendAt: Date;
}): void {
    const run = () =>
        triggerPuntoBWakeNow(input).catch((err) => {
            console.error('[vera-workflow] Wake Punto B enqueue fallito:', err);
        });

    try {
        after(run);
    } catch {
        void run();
    }
}
