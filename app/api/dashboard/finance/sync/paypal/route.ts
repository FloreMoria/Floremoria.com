import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import {
    getPaypalSyncStatus,
    runPaypalFinanceSync,
} from '@/lib/financial/paypalSync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const SYNC_FROM = new Date('2026-01-01T00:00:00.000Z');

/** POST: sync transazioni & commissioni PayPal dal 01/01/2026. */
export async function POST() {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const result = await runPaypalFinanceSync({ createdGte: SYNC_FROM });
        const status = await getPaypalSyncStatus();
        return NextResponse.json({
            ok: result.ok,
            from: '2026-01-01T00:00:00.000Z',
            transactionsUpserted: result.transactionsUpserted,
            feesUpserted: result.feesUpserted,
            recordCount: status.count,
            lastSyncAt: result.lastSyncAt,
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
