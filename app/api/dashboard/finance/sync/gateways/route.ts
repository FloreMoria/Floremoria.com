import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import prisma from '@/lib/prisma';
import { getPaypalSyncStatus } from '@/lib/financial/paypalSync';
import { stripeAccountBadgeFromMovement } from '@/lib/financial/stripeSync';
import { buildGatewaySyncRows } from '@/lib/financial/gatewaySyncRows';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FROM = new Date('2026-01-01T00:00:00.000Z');

/** GET: Stripe COM/EU + PayPal unificati, deduplicati, con date reali. */
export async function GET() {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const [stripeMeta, paypalStatus, stripeMovements, paypalLedger] = await Promise.all([
            prisma.systemState.findUnique({ where: { key: 'finance.stripe.last_sync' } }),
            getPaypalSyncStatus(),
            prisma.stripeFinanceMovement.findMany({
                where: { createdAtStripe: { gte: FROM } },
                orderBy: { createdAtStripe: 'desc' },
                take: 400,
            }),
            prisma.financialLedgerEntry.findMany({
                where: {
                    sourceType: 'PAYPAL_MOVEMENT',
                    accountingDate: { gte: FROM },
                    reversedAt: null,
                },
                orderBy: { accountingDate: 'desc' },
                take: 400,
            }),
        ]);

        const orderIds = [
            ...new Set(
                stripeMovements.map((m) => m.orderId).filter((id): id is string => Boolean(id))
            ),
        ];
        const orders =
            orderIds.length > 0
                ? await prisma.order.findMany({
                      where: { id: { in: orderIds } },
                      select: {
                          id: true,
                          orderNumber: true,
                          buyerFullName: true,
                          buyerEmail: true,
                      },
                  })
                : [];
        const orderById = new Map(orders.map((o) => [o.id, o]));

        const stripeEnriched = stripeMovements.map((m) => {
            const badge = stripeAccountBadgeFromMovement(m);
            const order = m.orderId ? orderById.get(m.orderId) : null;
            return {
                id: m.id,
                stripeId: m.stripeId,
                type: m.type,
                description: m.description,
                amountCents: m.amountCents,
                feeCents: m.feeCents,
                netCents: m.netCents,
                currency: m.currency,
                status: m.status,
                createdAtStripe: m.createdAtStripe.toISOString(),
                sourceId: m.sourceId,
                payoutId: m.payoutId,
                orderId: m.orderId,
                metadataJson: m.metadataJson,
                accountCode: badge.code,
                accountLabel: badge.label,
                order: order
                    ? {
                          orderNumber: order.orderNumber,
                          buyerFullName: order.buyerFullName,
                          buyerEmail: order.buyerEmail,
                      }
                    : null,
            };
        });

        const rows = buildGatewaySyncRows({
            stripeMovements: stripeEnriched,
            paypalTransactions: paypalStatus.transactions.map((t) => ({
                id: t.id,
                status: t.status,
                grossCents: t.grossCents,
                feeCents: t.feeCents,
                netCents: t.netCents,
                currency: t.currency,
                transactionDate: t.transactionDate,
                description: t.description,
                payerEmail: t.payerEmail,
                source: 'api',
            })),
            paypalLedgerEntries: paypalLedger.map((e) => ({
                id: e.id,
                sourceKey: e.sourceKey,
                sourceId: e.sourceId,
                category: e.category,
                accountingDate: e.accountingDate,
                description: e.description,
                counterpartyName: e.counterpartyName,
                totalCents: e.totalCents,
                metadataJson: e.metadataJson,
            })),
        });

        return NextResponse.json({
            ok: true,
            from: FROM.toISOString(),
            rows,
            count: rows.length,
            stripeLastSyncAt: stripeMeta?.value || null,
            paypalLastSyncAt: paypalStatus.lastSyncAt,
            stripeRecordCount: stripeMovements.length,
            paypalRecordCount: paypalStatus.count,
        });
    } catch (error) {
        console.error('[sync/gateways]', error);
        return NextResponse.json(
            {
                ok: false,
                error: error instanceof Error ? error.message : 'Errore caricamento gateway',
            },
            { status: 500 }
        );
    }
}
