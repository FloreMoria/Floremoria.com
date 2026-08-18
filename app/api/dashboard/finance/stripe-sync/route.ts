import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { runStripeFinanceSync } from '@/lib/financial/stripeSync';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** GET: elenco movimenti + fatture Stripe già sincronizzati. */
export async function GET(request: NextRequest) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const { searchParams } = new URL(request.url);
        const months = Math.min(Math.max(Number(searchParams.get('months') || 6), 1), 24);
        const since = new Date();
        since.setMonth(since.getMonth() - months);

        const [movements, invoices] = await Promise.all([
            prisma.stripeFinanceMovement.findMany({
                where: { createdAtStripe: { gte: since } },
                orderBy: { createdAtStripe: 'desc' },
                take: 500,
            }),
            prisma.stripeServiceInvoice.findMany({
                orderBy: { periodStart: 'desc' },
                take: 36,
            }),
        ]);

        return NextResponse.json({
            ok: true,
            movements,
            invoices,
            counts: { movements: movements.length, invoices: invoices.length },
        });
    } catch (error) {
        console.error('[stripe-sync GET]', error);
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : 'Errore sync read' },
            { status: 500 }
        );
    }
}

/** POST: sincronizza da Stripe API (balance_transactions, payouts, invoices). */
export async function POST(request: NextRequest) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        let monthsBack = 13;
        try {
            const body = await request.json();
            if (body?.monthsBack != null) {
                monthsBack = Math.min(Math.max(Number(body.monthsBack), 1), 24);
            }
        } catch {
            /* body opzionale */
        }

        const createdGte = new Date();
        createdGte.setMonth(createdGte.getMonth() - monthsBack);

        const result = await runStripeFinanceSync({ createdGte });
        return NextResponse.json({
            ok: result.errors.length === 0,
            movementsUpserted: result.movementsUpserted,
            payoutsUpserted: result.payoutsUpserted,
            invoicesUpserted: result.invoicesUpserted,
            errors: result.errors,
        });
    } catch (error) {
        console.error('[stripe-sync POST]', error);
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : 'Errore sync Stripe' },
            { status: 500 }
        );
    }
}
