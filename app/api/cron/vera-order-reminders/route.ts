/**
 * GET /api/cron/vera-order-reminders
 * - Flush Punto A differiti (creazione/assegnazione fuori fascia → invio in 08:00–20:00 Europe/Rome)
 * - Flush Punto B schedulati (+30 min diurno / 08:30 notturno)
 * - PUNTO G — un solo sollecito cliente/fiorista per ordine (finestra 48h consegna)
 * - Promemoria ricorrenze defunto (nascita/morte) a -3 giorni
 *
 * Rinvio manuale singolo ordine (test):
 *   GET /api/cron/vera-order-reminders?orderNumber=FT-CO-26-005&force=1
 * Solo ricorrenze:
 *   GET /api/cron/vera-order-reminders?anniversaryOnly=1
 */
import { NextRequest, NextResponse } from 'next/server';
import { runPuntoGOrderReminders } from '@/lib/vera/orderWorkflow/puntoGReminders';
import { flushPendingPuntoAFloristNotifications } from '@/lib/vera/orderWorkflow/flushPendingPuntoA';
import { flushPendingPuntoBCustomerConfirm } from '@/lib/vera/orderWorkflow/flushPendingPuntoB';
import { resendCustomerWaitingUpdateForOrder, backfillCustomerWaitingUpdateChatLog } from '@/lib/vera/orderWorkflow/resendCustomerWaitingUpdate';
import { runDeceasedAnniversaryReminders } from '@/lib/vera/deceasedAnniversaryReminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function isAuthorized(request: NextRequest): boolean {
    const secret =
        process.env.CRON_SECRET?.trim() ||
        process.env.POSTMAN_CRON_SECRET?.trim();
    if (!secret) return process.env.NODE_ENV !== 'production';

    const authHeader = request.headers.get('authorization') || '';
    if (authHeader.replace(/^Bearer\s+/i, '').trim() === secret) return true;

    return request.headers.get('x-cron-key')?.trim() === secret;
}

export async function GET(request: NextRequest) {
    if (!isAuthorized(request)) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const orderNumber = request.nextUrl.searchParams.get('orderNumber')?.trim();
    if (orderNumber) {
        const force = request.nextUrl.searchParams.get('force') === '1';
        const backfillChat = request.nextUrl.searchParams.get('backfillChat') === '1';
        if (backfillChat) {
            const result = await backfillCustomerWaitingUpdateChatLog(orderNumber);
            return NextResponse.json({ success: result.ok, mode: 'backfill_chat', ...result });
        }
        const result = await resendCustomerWaitingUpdateForOrder(orderNumber, { force });
        return NextResponse.json({ success: result.ok, mode: 'single_order', ...result });
    }

    // Solo promemoria ricorrenze (test/manual): ?anniversaryOnly=1
    if (request.nextUrl.searchParams.get('anniversaryOnly') === '1') {
        const anniversaryReminders = await runDeceasedAnniversaryReminders();
        return NextResponse.json({
            success: anniversaryReminders.ok,
            mode: 'anniversary_only',
            anniversaryReminders,
        });
    }

    const puntoAFlush = await flushPendingPuntoAFloristNotifications();
    const puntoBFlush = await flushPendingPuntoBCustomerConfirm();
    const result = await runPuntoGOrderReminders();
    // Ricorrenze nascita/morte a -3 giorni (Europe/Rome), sullo stesso cron giornaliero Hobby.
    let anniversaryReminders;
    try {
        anniversaryReminders = await runDeceasedAnniversaryReminders();
    } catch (err) {
        console.error('[cron/vera-order-reminders] anniversary reminders failed:', err);
        anniversaryReminders = {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
    return NextResponse.json({
        success: true,
        mode: 'batch',
        puntoAFlush,
        puntoBFlush,
        ...result,
        anniversaryReminders,
    });
}
