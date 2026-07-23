/**
 * GET /api/cron/punto-b-wake?orderId=…&sendAt=ISO
 * Hop della catena: dorme fino a 50s, se non è ancora l'ora si richiama; altrimenti invia Punto B.
 */
import { NextRequest, NextResponse, after } from 'next/server';
import { runPuntoBCustomerOrderConfirm } from '@/lib/vera/orderWorkflow/puntoBCustomerConfirm';
import {
    computeWakeSleepMs,
    sleepMs,
    triggerPuntoBWakeNow,
} from '@/lib/vera/orderWorkflow/schedulePuntoBWake';
import { isCustomerConfirmSendDue } from '@/lib/datetime/customerConfirmSchedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

    const orderId = request.nextUrl.searchParams.get('orderId')?.trim();
    const sendAtRaw = request.nextUrl.searchParams.get('sendAt')?.trim();
    if (!orderId || !sendAtRaw) {
        return NextResponse.json({ ok: false, error: 'missing_params' }, { status: 400 });
    }

    const sendAt = new Date(sendAtRaw);
    if (Number.isNaN(sendAt.getTime())) {
        return NextResponse.json({ ok: false, error: 'invalid_sendAt' }, { status: 400 });
    }

    const now = new Date();
    if (!isCustomerConfirmSendDue(sendAt, now)) {
        const sleepFor = computeWakeSleepMs(sendAt, now);
        await sleepMs(sleepFor);

        if (!isCustomerConfirmSendDue(sendAt)) {
            after(() => {
                void triggerPuntoBWakeNow({ orderId, sendAt }).catch((err) => {
                    console.error('[vera-workflow] Re-wake Punto B fallito:', err);
                });
            });
            return NextResponse.json({
                ok: true,
                deferred: true,
                sleptMs: sleepFor,
                nextSendAt: sendAt.toISOString(),
            });
        }
    }

    const result = await runPuntoBCustomerOrderConfirm(orderId, { bypassSchedule: true });
    return NextResponse.json({
        ok: result.ok,
        skipped: result.skipped,
        error: result.error,
        deferred: result.deferred,
        scheduledFor: result.scheduledFor,
    });
}
