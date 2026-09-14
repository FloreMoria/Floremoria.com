import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import {
    listConfiguredStripeAccounts,
    runStripeFinanceSync,
    stripeAccountBadgeFromMovement,
} from '@/lib/financial/stripeSync';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const YEAR_FROM = new Date('2026-01-01T00:00:00.000Z');

/** POST: sync Stripe COM + EU in parallelo (default: incrementale ~35gg). */
export async function POST(request: Request) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const url = new URL(request.url);
        let mode = (url.searchParams.get('mode') || 'incremental') as 'incremental' | 'full';
        try {
            const body = (await request.json().catch(() => null)) as {
                mode?: string;
            } | null;
            if (body?.mode === 'full' || body?.mode === 'incremental') {
                mode = body.mode;
            }
        } catch {
            /* no body */
        }

        const result = await runStripeFinanceSync({
            mode,
            limitPages: mode === 'full' ? 40 : 15,
            enrichFromCharge: false,
            syncLedger: false,
        });
        const meta = await prisma.systemState.findUnique({
            where: { key: 'finance.stripe.last_sync' },
        });
        const count = await prisma.stripeFinanceMovement.count({
            where: { createdAtStripe: { gte: YEAR_FROM } },
        });
        return NextResponse.json({
            ok: result.ok || result.movementsUpserted > 0,
            mode: result.mode,
            from: result.syncedFrom,
            yearFrom: '2026-01-01T00:00:00.000Z',
            movementsUpserted: result.movementsUpserted,
            movementsCreated: result.movementsCreated,
            movementsUpdated: result.movementsUpdated,
            payoutsUpserted: result.payoutsUpserted,
            invoicesUpserted: result.invoicesUpserted,
            accountsSynced: result.accountsSynced,
            accountsConfigured: listConfiguredStripeAccounts().map((a) => ({
                code: a.code,
                label: a.label,
            })),
            recordCount: count,
            lastSyncAt: meta?.value || new Date().toISOString(),
            durationMs: result.durationMs,
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
                where: { createdAtStripe: { gte: YEAR_FROM } },
            }),
            prisma.stripeFinanceMovement.findMany({
                where: { createdAtStripe: { gte: YEAR_FROM } },
                orderBy: { createdAtStripe: 'desc' },
                take: 200,
            }),
        ]);
        const enriched = movements.map((m) => {
            const badge = stripeAccountBadgeFromMovement(m);
            return {
                ...m,
                accountCode: badge.code,
                accountLabel: badge.label,
            };
        });
        return NextResponse.json({
            ok: true,
            from: '2026-01-01T00:00:00.000Z',
            lastSyncAt: meta?.value || null,
            recordCount: count,
            movements: enriched,
            accountsConfigured: listConfiguredStripeAccounts().map((a) => ({
                code: a.code,
                label: a.label,
            })),
            badge: 'Sincronizzato da API',
        });
    } catch (error) {
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : 'Errore' },
            { status: 500 }
        );
    }
}
