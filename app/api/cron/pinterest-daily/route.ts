/**
 * GET /api/cron/pinterest-daily
 *
 * Cron Job Giornaliero Pinterest Agent (09:00 UTC):
 * Genera e pubblica un Pin quotidiano seguendo la rotazione ciclica dei 5 temi:
 * 1. Persone e ricordi affettuosi
 * 2. Solo composizioni floreali e botanica
 * 3. Funerali e cerimonie
 * 4. Cura della tomba al cimitero
 * 5. Memorial per animali domestici (Pet Memorial)
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

export async function GET(request: NextRequest) {
    if (!isAuthorized(request)) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    try {
        console.log('[Pinterest Cron] Trigger giornaliero ricevuto — avvio Pinterest Agent…');

        const result = await generateDailyPinterestPin();

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
                message: 'Pin quotidiano Pinterest generato e pubblicato con successo',
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
