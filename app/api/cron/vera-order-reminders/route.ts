/**
 * GET /api/cron/vera-order-reminders
 * PUNTO G — solleciti 20h utente/fiorista (ogni ora).
 *
 * Rinvio manuale singolo ordine (test):
 *   GET /api/cron/vera-order-reminders?orderNumber=FT-CO-26-005&force=1
 */
import { NextRequest, NextResponse } from 'next/server';
import { runPuntoGOrderReminders } from '@/lib/vera/orderWorkflow/puntoGReminders';
import { resendCustomerWaitingUpdateForOrder, backfillCustomerWaitingUpdateChatLog } from '@/lib/vera/orderWorkflow/resendCustomerWaitingUpdate';

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

    const result = await runPuntoGOrderReminders();
    return NextResponse.json({ success: true, mode: 'batch', ...result });
}
