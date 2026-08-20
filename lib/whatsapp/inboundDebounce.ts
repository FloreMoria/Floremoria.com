/**
 * Debounce inbound WhatsApp (60s dall'ultimo messaggio) + aggregazione sequenziale.
 * Persistenza Neon: sopravvive a cold start serverless; flush via wake HTTP a catena.
 */

import { after } from 'next/server';
import prisma from '@/lib/prisma';

export const VERA_INBOUND_DEBOUNCE_MS = 60_000;
const WAKE_PATH = '/api/cron/vera-inbound-debounce-flush';
const MAX_SLEEP_MS = 50_000;
const MAX_ITEMS = 40;

export type InboundDebounceItem = {
    inboundMessageId?: string;
    body: string;
    mediaUrl?: string | null;
    unsupportedMedia?: boolean;
    forceFloristUnsupportedMediaReply?: boolean;
    at: string;
};

export type InboundDebounceBatchPayload = {
    phoneKey: string;
    outboundAddress: string;
    senderName: string;
    item: InboundDebounceItem;
};

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

export function computeDebounceWakeSleepMs(flushAfter: Date, now: Date = new Date()): number {
    const remaining = flushAfter.getTime() - now.getTime();
    if (remaining <= 0) return 0;
    return Math.min(remaining, MAX_SLEEP_MS);
}

function parseItems(raw: unknown): InboundDebounceItem[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((x): x is InboundDebounceItem => Boolean(x && typeof x === 'object'));
}

/**
 * Accoda un inbound al batch PENDING del contatto e riparte il timer 60s.
 * Ritorna flushAfter aggiornato (per wake).
 */
export async function appendInboundDebounceItem(
    payload: InboundDebounceBatchPayload
): Promise<{ batchId: string; flushAfter: Date; itemCount: number }> {
    const now = new Date();
    const flushAfter = new Date(now.getTime() + VERA_INBOUND_DEBOUNCE_MS);
    const phoneKey = payload.phoneKey.trim();

    const existing = await prisma.whatsAppInboundDebounceBatch.findUnique({
        where: { phoneKey },
    });

    if (existing && existing.status === 'PENDING') {
        const items = parseItems(existing.itemsJson);
        items.push(payload.item);
        while (items.length > MAX_ITEMS) items.shift();

        const updated = await prisma.whatsAppInboundDebounceBatch.update({
            where: { phoneKey },
            data: {
                outboundAddress: payload.outboundAddress,
                senderName: payload.senderName || existing.senderName,
                lastInboundAt: now,
                flushAfter,
                itemsJson: items,
                status: 'PENDING',
            },
        });
        return {
            batchId: updated.id,
            flushAfter: updated.flushAfter,
            itemCount: items.length,
        };
    }

    // Nuovo batch (o riparte dopo DONE/FLUSHING stale).
    const created = await prisma.whatsAppInboundDebounceBatch.upsert({
        where: { phoneKey },
        create: {
            phoneKey,
            outboundAddress: payload.outboundAddress,
            senderName: payload.senderName,
            status: 'PENDING',
            lastInboundAt: now,
            flushAfter,
            itemsJson: [payload.item],
        },
        update: {
            outboundAddress: payload.outboundAddress,
            senderName: payload.senderName,
            status: 'PENDING',
            lastInboundAt: now,
            flushAfter,
            itemsJson: [payload.item],
        },
    });

    return {
        batchId: created.id,
        flushAfter: created.flushAfter,
        itemCount: 1,
    };
}

export async function triggerInboundDebounceWake(input: {
    phoneKey: string;
    flushAfter: Date;
}): Promise<void> {
    const base = appBaseUrl();
    const headers = cronAuthHeaders();
    if (!base || !headers) {
        console.warn(
            '[wa-debounce] Wake non avviato: manca APP_URL/VERCEL_URL o CRON_SECRET'
        );
        return;
    }

    const url = new URL(WAKE_PATH, `${base}/`);
    url.searchParams.set('phoneKey', input.phoneKey);
    url.searchParams.set('flushAfter', input.flushAfter.toISOString());

    const res = await fetch(url.toString(), {
        method: 'GET',
        headers,
        cache: 'no-store',
    });
    if (!res.ok) {
        console.error(
            `[wa-debounce] Wake HTTP ${res.status} phoneKey=${input.phoneKey.slice(0, 32)}`
        );
    }
}

export function enqueueInboundDebounceWake(input: {
    phoneKey: string;
    flushAfter: Date;
}): void {
    const run = () =>
        triggerInboundDebounceWake(input).catch((err) => {
            console.error('[wa-debounce] Wake enqueue fallito:', err);
        });
    try {
        after(run);
    } catch {
        void run();
    }
}

/**
 * Claim atomico PENDING → FLUSHING se quiete ≥ 60s dall'ultimo inbound.
 */
export async function tryClaimInboundDebounceBatchForFlush(phoneKey: string): Promise<{
    ok: true;
    batch: {
        id: string;
        phoneKey: string;
        outboundAddress: string;
        senderName: string;
        items: InboundDebounceItem[];
        lastInboundAt: Date;
    };
} | { ok: false; reason: 'not_ready' | 'missing' | 'busy'; remainingMs?: number }> {
    const now = new Date();
    const row = await prisma.whatsAppInboundDebounceBatch.findUnique({
        where: { phoneKey },
    });
    if (!row || row.status === 'DONE') {
        return { ok: false, reason: 'missing' };
    }
    if (row.status === 'FLUSHING') {
        return { ok: false, reason: 'busy' };
    }

    const quietDeadline = new Date(row.lastInboundAt.getTime() + VERA_INBOUND_DEBOUNCE_MS);
    if (now < quietDeadline) {
        return {
            ok: false,
            reason: 'not_ready',
            remainingMs: quietDeadline.getTime() - now.getTime(),
        };
    }

    const claimed = await prisma.whatsAppInboundDebounceBatch.updateMany({
        where: { phoneKey, status: 'PENDING', lastInboundAt: row.lastInboundAt },
        data: { status: 'FLUSHING' },
    });
    if (claimed.count === 0) {
        return { ok: false, reason: 'busy' };
    }

    const fresh = await prisma.whatsAppInboundDebounceBatch.findUniqueOrThrow({
        where: { phoneKey },
    });

    return {
        ok: true,
        batch: {
            id: fresh.id,
            phoneKey: fresh.phoneKey,
            outboundAddress: fresh.outboundAddress,
            senderName: fresh.senderName,
            items: parseItems(fresh.itemsJson),
            lastInboundAt: fresh.lastInboundAt,
        },
    };
}

export async function markInboundDebounceBatchDone(phoneKey: string): Promise<void> {
    await prisma.whatsAppInboundDebounceBatch.updateMany({
        where: { phoneKey },
        data: { status: 'DONE', itemsJson: [] },
    });
}

export async function releaseInboundDebounceBatchToPending(
    phoneKey: string,
    flushAfter: Date
): Promise<void> {
    await prisma.whatsAppInboundDebounceBatch.updateMany({
        where: { phoneKey, status: 'FLUSHING' },
        data: { status: 'PENDING', flushAfter },
    });
}

/** Componi un unico contesto testuale per Vera (tutti i pezzi del burst). */
export function composeAggregatedInboundContext(items: InboundDebounceItem[]): {
    aggregatedBody: string;
    primaryMediaUrl: string | null;
    mediaCount: number;
    textParts: string[];
    unsupportedMediaOnly: boolean;
    forceFloristUnsupportedMediaReply: boolean;
    lastInboundMessageId?: string;
} {
    const lines: string[] = [];
    const textParts: string[] = [];
    let mediaCount = 0;
    let primaryMediaUrl: string | null = null;
    let unsupportedCount = 0;
    let forceUnsupported = false;
    let lastInboundMessageId: string | undefined;

    for (let i = 0; i < items.length; i++) {
        const it = items[i];
        lastInboundMessageId = it.inboundMessageId || lastInboundMessageId;
        const time = (it.at || '').slice(11, 19) || `#${i + 1}`;
        if (it.mediaUrl) {
            mediaCount += 1;
            if (!primaryMediaUrl) primaryMediaUrl = it.mediaUrl;
            const caption = (it.body || '').trim();
            const captionClean =
                caption && !/^\[media\]$/i.test(caption) && !/^\[allegato/i.test(caption)
                    ? ` — caption: ${caption}`
                    : '';
            lines.push(`${i + 1}. [${time}] [foto/media allegato]${captionClean}`);
            if (captionClean) textParts.push(caption);
        } else if (it.unsupportedMedia) {
            unsupportedCount += 1;
            forceUnsupported = forceUnsupported || Boolean(it.forceFloristUnsupportedMediaReply);
            lines.push(`${i + 1}. [${time}] [allegato non leggibile / non foto]`);
        } else {
            const body = (it.body || '').trim();
            if (body) {
                textParts.push(body);
                lines.push(`${i + 1}. [${time}] ${body}`);
            }
        }
    }

    const header =
        items.length > 1
            ? `[Sequenza messaggi aggregati — ${items.length} pezzi in ~60s. Rispondi UNA sola volta, in modo organico, a TUTTI i punti. Non salutare di nuovo se il dialogo è già in corso. Non chiedere conferme ridondanti su "ok"/"ricevuto"/foto già arrivate.]\n`
            : '';

    return {
        aggregatedBody: `${header}${lines.join('\n')}`.trim() || '[media]',
        primaryMediaUrl,
        mediaCount,
        textParts,
        unsupportedMediaOnly: unsupportedCount > 0 && mediaCount === 0 && textParts.length === 0,
        forceFloristUnsupportedMediaReply: forceUnsupported && mediaCount === 0,
        lastInboundMessageId,
    };
}

/**
 * Accoda inbound + avvia wake. Non invoca Vera subito.
 * Fallback: se manca APP_URL/CRON_SECRET, usa after()+sleep nello stesso processo (dev).
 */
export async function scheduleVeraInboundDebounce(
    payload: InboundDebounceBatchPayload
): Promise<{ batchId: string; flushAfter: Date; itemCount: number }> {
    const result = await appendInboundDebounceItem(payload);
    const canWake = Boolean(appBaseUrl() && cronAuthHeaders());
    if (canWake) {
        enqueueInboundDebounceWake({
            phoneKey: payload.phoneKey,
            flushAfter: result.flushAfter,
        });
    } else {
        console.warn(
            '[wa-debounce] Wake HTTP non disponibile: fallback after()+sleep locale'
        );
        const phoneKey = payload.phoneKey;
        const flushAfter = result.flushAfter;
        const runLocal = async () => {
            const wait = Math.max(0, flushAfter.getTime() - Date.now());
            await sleepMs(Math.min(wait, MAX_SLEEP_MS));
            const { flushDebouncedVeraReply } = await import(
                '@/lib/whatsapp/flushDebouncedVeraReply'
            );
            for (let attempt = 0; attempt < 3; attempt++) {
                const claimed = await tryClaimInboundDebounceBatchForFlush(phoneKey);
                if (!claimed.ok) {
                    if (claimed.reason === 'not_ready' && claimed.remainingMs != null) {
                        await sleepMs(Math.min(claimed.remainingMs + 200, MAX_SLEEP_MS));
                        continue;
                    }
                    return;
                }
                const composed = composeAggregatedInboundContext(claimed.batch.items);
                try {
                    await flushDebouncedVeraReply({
                        phoneKey: claimed.batch.phoneKey,
                        outboundAddress: claimed.batch.outboundAddress,
                        senderName: claimed.batch.senderName,
                        batchId: claimed.batch.id,
                        aggregatedBody: composed.aggregatedBody,
                        mediaUrl: composed.primaryMediaUrl,
                        mediaCount: composed.mediaCount,
                        textParts: composed.textParts,
                        unsupportedMediaOnly: composed.unsupportedMediaOnly,
                        forceFloristUnsupportedMediaReply:
                            composed.forceFloristUnsupportedMediaReply,
                        lastInboundMessageId: composed.lastInboundMessageId,
                    });
                    await markInboundDebounceBatchDone(phoneKey);
                } catch (err) {
                    console.error('[wa-debounce] Fallback flush fallito:', err);
                    await releaseInboundDebounceBatchToPending(
                        phoneKey,
                        new Date(Date.now() + 15_000)
                    );
                }
                return;
            }
        };
        try {
            after(() => {
                void runLocal();
            });
        } catch {
            void runLocal();
        }
    }
    console.info(
        `[wa-debounce] Accodato phone=${payload.phoneKey.slice(0, 28)} items=${result.itemCount} flushAfter=${result.flushAfter.toISOString()}`
    );
    return result;
}
