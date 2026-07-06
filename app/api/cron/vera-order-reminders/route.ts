/**
 * GET /api/cron/vera-order-reminders
 * PUNTO G — solleciti 20h utente/fiorista (ogni ora).
 */
import { NextRequest, NextResponse } from 'next/server';
import { runPuntoGOrderReminders } from '@/lib/vera/orderWorkflow/puntoGReminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function isAuthorized(request: NextRequest): boolean {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) return process.env.NODE_ENV !== 'production';

    const authHeader = request.headers.get('authorization') || '';
    if (authHeader.replace(/^Bearer\s+/i, '').trim() === secret) return true;

    return request.headers.get('x-cron-key')?.trim() === secret;
}

export async function GET(request: NextRequest) {
    if (!isAuthorized(request)) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const result = await runPuntoGOrderReminders();
    return NextResponse.json({ success: true, ...result });
}
