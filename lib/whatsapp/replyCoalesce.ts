/**
 * Coalesce inbound WhatsApp (legacy in-process, finestra corta).
 * Il debounce primario cross-istanza è `inboundDebounce.ts` (60s su Neon + wake).
 */
export type CoalesceJob<T> = () => Promise<T>;

type PendingBucket = {
    timer: ReturnType<typeof setTimeout>;
    jobs: Array<{
        run: CoalesceJob<unknown>;
        resolve: (v: unknown) => void;
        reject: (e: unknown) => void;
    }>;
};

const pendingByPhone = new Map<string, PendingBucket>();

/** Solo fallback locale same-process; produzione usa debounce Neon 60s. */
const DEFAULT_WINDOW_MS = 2800;

/**
 * Accoda il lavoro di reply per `phoneKey`. Solo l'ultimo job della finestra viene eseguito;
 * i precedenti risolvono con `{ coalesced: true }` senza inviare.
 */
export function enqueueVeraReplyCoalesce<T extends { coalesced?: boolean }>(
    phoneKey: string,
    job: CoalesceJob<T>,
    windowMs = DEFAULT_WINDOW_MS
): Promise<T | { ok: true; coalesced: true; skipped: 'coalesced' }> {
    return new Promise((resolve, reject) => {
        const existing = pendingByPhone.get(phoneKey);
        if (existing) {
            clearTimeout(existing.timer);
            for (const prev of existing.jobs) {
                prev.resolve({ ok: true, coalesced: true, skipped: 'coalesced' });
            }
            existing.jobs = [];
        }

        const bucket: PendingBucket = {
            jobs: [],
            timer: setTimeout(() => {
                pendingByPhone.delete(phoneKey);
                const last = bucket.jobs[bucket.jobs.length - 1];
                if (!last) return;
                last.run().then(last.resolve).catch(last.reject);
            }, windowMs),
        };

        bucket.jobs.push({
            run: job as CoalesceJob<unknown>,
            resolve: resolve as (v: unknown) => void,
            reject,
        });
        pendingByPhone.set(phoneKey, bucket);
    });
}

/** Raggruppa messaggi dello stesso POST webhook per identità sessione (E.164 o BSUID). */
export function groupIncomingByPhone<T extends { phoneKey?: string; phoneE164?: string | null }>(
    items: T[]
): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const item of items) {
        const key = item.phoneKey || item.phoneE164 || '';
        if (!key) continue;
        const list = map.get(key) || [];
        list.push(item);
        map.set(key, list);
    }
    return map;
}
