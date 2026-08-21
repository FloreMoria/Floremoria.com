import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { runStripeFinanceSync } from '@/lib/financial/stripeSync';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const SYNC_FROM = new Date('2026-01-01T00:00:00.000Z');

/** POST: sync Stripe BalanceTransaction / payouts / fee dal 01/01/2026. */
export async function POST() {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const result = await runStripeFinanceSync({
            createdGte: SYNC_FROM,
            limitPages: 60,
        });
        const meta = await prisma.systemState.findUnique({
            where: { key: 'finance.stripe.last_sync' },
        });
        const count = await prisma.stripeFinanceMovement.count({
            where: { createdAtStripe: { gte: SYNC_FROM } },
        });
        return NextResponse.json({
            ok: result.ok,
            from: '2026-01-01T00:00:00.000Z',
            movementsUpserted: result.movementsUpserted,
            payoutsUpserted: result.payoutsUpserted,
            invoicesUpserted: result.invoicesUpserted,
            recordCount: count,
            lastSyncAt: meta?.value || new Date().toISOString(),
            errors: result.errors,
            badge: 'Sincronizzato da API',
        });
    } catch (error) {
        console.error('[sync/stripe]', error);
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : 'Sync Stripe fallita' },
            { status: 500 }
        );
    }
}

export async function GET() {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;
    try {
        const [meta, count, movements] = await Promise.all([
            prisma.systemState.findUnique({ where: { key: 'finance.stripe.last_sync' } }),
            prisma.stripeFinanceMovement.count({
                where: { createdAtStripe: { gte: SYNC_FROM } },
            }),
            prisma.stripeFinanceMovement.findMany({
                where: { createdAtStripe: { gte: SYNC_FROM } },
                orderBy: { createdAtStripe: 'desc' },
                take: 200,
            }),
        ]);
        return NextResponse.json({
            ok: true,
            from: '2026-01-01T00:00:00.000Z',
            lastSyncAt: meta?.value || null,
            recordCount: count,
            movements,
            badge: 'Sincronizzato da API',
        });
    } catch (error) {
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : 'Errore' },
            { status: 500 }
        );
    }
}
