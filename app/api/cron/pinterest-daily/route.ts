/**
 * GET|POST /api/cron/pinterest-daily
 *
 * Pubblicazione giornaliera automatica Pin Pinterest (09:00 UTC / cron Vercel):
 * nessuna approvazione manuale — genera contenuto (rotazione temi) e pubblica via API v5.
 * Auth: Authorization Bearer CRON_SECRET oppure header x-cron-key.
 */
import { NextRequest, NextResponse } from 'next/server';
import { generateDailyPinterestPin } from '@/lib/social/pinterestAgent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function isAuthorized(request: NextRequest): boolean {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) return process.env.NODE_ENV !== 'production';

    const authHeader = request.headers.get('authorization') || '';
    if (authHeader.replace(/^Bearer\s+/i, '').trim() === secret) return true;

    const cronKey = request.headers.get('x-cron-key')?.trim();
    return cronKey === secret;
}

async function runDailyPin(request: NextRequest) {
    if (!isAuthorized(request)) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const force = request.nextUrl.searchParams.get('force') === '1';

    try {
        console.log(
            `[Pinterest Cron] Trigger automatico ricevuto — avvio Pinterest Agent (force=${force})…`
        );

        const result = await generateDailyPinterestPin({ force });

        if (!result.success) {
            console.error('[Pinterest Cron] Fallimento generazione/invio Pin:', result.error);
            return NextResponse.json(
                {
                    success: false,
                    error: result.error || 'Creazione Pin giornaliero fallita',
                    result,
                },
                { status: 500 }
            );
        }

        return NextResponse.json(
            {
                success: true,
                message: result.skipped
                    ? 'Pin quotidiano già pubblicato oggi — skip idempotente'
                    : 'Pin quotidiano Pinterest generato e pubblicato automaticamente',
                timestamp: new Date().toISOString(),
                result,
            },
            { status: 200 }
        );
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('❌ Errore nel cron job pinterest-daily:', msg);
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    return runDailyPin(request);
}

/** Alias POST: alcuni scheduler / worker interni invocano POST. */
export async function POST(request: NextRequest) {
    return runDailyPin(request);
}
