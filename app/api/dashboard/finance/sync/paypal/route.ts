import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import {
    getPaypalSyncStatus,
    runPaypalFinanceSync,
} from '@/lib/financial/paypalSync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** POST: sync PayPal (default: incrementale ultimi ≤31 giorni). */
export async function POST(request: Request) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const url = new URL(request.url);
        let mode = (url.searchParams.get('mode') || 'incremental') as 'incremental' | 'full';
        try {
            const body = (await request.json().catch(() => null)) as { mode?: string } | null;
            if (body?.mode === 'full' || body?.mode === 'incremental') {
                mode = body.mode;
            }
        } catch {
            /* no body */
        }

        const result = await runPaypalFinanceSync({ mode });
        const status = await getPaypalSyncStatus();

        if (result.apiForbidden) {
            return NextResponse.json({
                ok: false,
                apiForbidden: true,
                error:
                    "La sincronizzazione in tempo reale è attiva tramite Webhook. Per caricare lo storico pregresso utilizza l'upload del file CSV.",
                mode: result.mode,
                from: result.syncedFrom,
                to: result.syncedTo,
                transactionsUpserted: 0,
                feesUpserted: 0,
                found: 0,
                recordCount: status.count,
                lastSyncAt: status.lastSyncAt,
                durationMs: result.durationMs,
                errors: result.errors,
                badge: 'Webhook attivo',
            });
        }

        return NextResponse.json({
            ok: result.ok || result.transactionsUpserted > 0,
            mode: result.mode,
            from: result.syncedFrom,
            to: result.syncedTo,
            found: result.found,
            transactionsUpserted: result.transactionsUpserted,
            feesUpserted: result.feesUpserted,
            recordCount: status.count,
            lastSyncAt: result.lastSyncAt,
            durationMs: result.durationMs,
            errors: result.errors,
            badge: 'Sincronizzato da API',
        });
    } catch (error) {
        console.error('[sync/paypal]', error);
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : 'Sync PayPal fallita' },
            { status: 500 }
        );
    }
}

export async function GET() {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;
    try {
        const status = await getPaypalSyncStatus();
        return NextResponse.json({
            ok: true,
            from: '2026-01-01T00:00:00.000Z',
            lastSyncAt: status.lastSyncAt,
            recordCount: status.count,
            transactions: status.transactions,
            badge: 'Sincronizzato da API',
        });
    } catch (error) {
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : 'Errore' },
            { status: 500 }
        );
    }
}
