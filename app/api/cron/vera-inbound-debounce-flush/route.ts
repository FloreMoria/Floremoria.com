/**
 * GET /api/cron/vera-inbound-debounce-flush?phoneKey=…&flushAfter=ISO
 * Hop wake: dorme fino a flushAfter (max 50s), poi flush batch se quiete ≥ 60s.
 */
import { NextRequest, NextResponse, after } from 'next/server';
import {
    composeAggregatedInboundContext,
    computeDebounceWakeSleepMs,
    markInboundDebounceBatchDone,
    releaseInboundDebounceBatchToPending,
    sleepMs,
    triggerInboundDebounceWake,
    tryClaimInboundDebounceBatchForFlush,
    VERA_INBOUND_DEBOUNCE_MS,
} from '@/lib/whatsapp/inboundDebounce';
import { flushDebouncedVeraReply } from '@/lib/whatsapp/flushDebouncedVeraReply';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function isAuthorized(request: NextRequest): boolean {
    const secret =
        process.env.CRON_SECRET?.trim() || process.env.POSTMAN_CRON_SECRET?.trim();
    if (!secret) return process.env.NODE_ENV !== 'production';

    const authHeader = request.headers.get('authorization') || '';
    if (authHeader.replace(/^Bearer\s+/i, '').trim() === secret) return true;
    return request.headers.get('x-cron-key')?.trim() === secret;
}

export async function GET(request: NextRequest) {
    if (!isAuthorized(request)) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const phoneKey = request.nextUrl.searchParams.get('phoneKey')?.trim();
    const flushAfterRaw = request.nextUrl.searchParams.get('flushAfter')?.trim();
    if (!phoneKey || !flushAfterRaw) {
        return NextResponse.json({ ok: false, error: 'missing_params' }, { status: 400 });
    }

    const flushAfter = new Date(flushAfterRaw);
    if (Number.isNaN(flushAfter.getTime())) {
        return NextResponse.json({ ok: false, error: 'invalid_flushAfter' }, { status: 400 });
    }

    const now = new Date();
    if (now < flushAfter) {
        const sleepFor = computeDebounceWakeSleepMs(flushAfter, now);
        await sleepMs(sleepFor);

        if (new Date() < flushAfter) {
            after(() => {
                void triggerInboundDebounceWake({ phoneKey, flushAfter }).catch((err) => {
                    console.error('[wa-debounce] Re-wake fallito:', err);
                });
            });
            return NextResponse.json({
                ok: true,
                deferred: true,
                sleptMs: sleepFor,
                nextFlushAfter: flushAfter.toISOString(),
            });
        }
    }

    const claimed = await tryClaimInboundDebounceBatchForFlush(phoneKey);
    if (!claimed.ok) {
        if (claimed.reason === 'not_ready' && claimed.remainingMs != null) {
            const nextFlush = new Date(Date.now() + claimed.remainingMs);
            after(() => {
                void triggerInboundDebounceWake({ phoneKey, flushAfter: nextFlush }).catch(
                    (err) => console.error('[wa-debounce] Re-wake not_ready fallito:', err)
                );
            });
            return NextResponse.json({
                ok: true,
                deferred: true,
                reason: 'not_ready',
                remainingMs: claimed.remainingMs,
            });
        }
        return NextResponse.json({
            ok: true,
            skipped: claimed.reason,
        });
    }

    const composed = composeAggregatedInboundContext(claimed.batch.items);
    try {
        const result = await flushDebouncedVeraReply({
            phoneKey: claimed.batch.phoneKey,
            outboundAddress: claimed.batch.outboundAddress,
            senderName: claimed.batch.senderName,
            batchId: claimed.batch.id,
            aggregatedBody: composed.aggregatedBody,
            mediaUrl: composed.primaryMediaUrl,
            mediaCount: composed.mediaCount,
            textParts: composed.textParts,
            unsupportedMediaOnly: composed.unsupportedMediaOnly,
            forceFloristUnsupportedMediaReply: composed.forceFloristUnsupportedMediaReply,
            lastInboundMessageId: composed.lastInboundMessageId,
        });
        await markInboundDebounceBatchDone(phoneKey);
        return NextResponse.json({
            ok: true,
            flushed: true,
            itemCount: claimed.batch.items.length,
            mediaCount: composed.mediaCount,
            debounceMs: VERA_INBOUND_DEBOUNCE_MS,
            result,
        });
    } catch (err) {
        console.error('[wa-debounce] Flush fallito:', err);
        const retryAfter = new Date(Date.now() + 15_000);
        await releaseInboundDebounceBatchToPending(phoneKey, retryAfter);
        after(() => {
            void triggerInboundDebounceWake({ phoneKey, flushAfter: retryAfter }).catch(() => undefined);
        });
        return NextResponse.json(
            {
                ok: false,
                error: err instanceof Error ? err.message : String(err),
            },
            { status: 500 }
        );
    }
}
