/**
 * Coalesce inbound WhatsApp: una sola reply VERA per burst dallo stesso numero.
 * Perché: Meta spesso consegna N messaggi (foto+caption+ok) in sequenza → N risposte AI.
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

/** Raggruppa messaggi dello stesso POST webhook per telefono (ordine preservato). */
export function groupIncomingByPhone<T extends { phoneE164: string }>(items: T[]): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const item of items) {
        const list = map.get(item.phoneE164) || [];
        list.push(item);
        map.set(item.phoneE164, list);
    }
    return map;
}
