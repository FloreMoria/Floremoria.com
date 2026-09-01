import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import prisma from '@/lib/prisma';
import { getPaypalSyncStatus } from '@/lib/financial/paypalSync';
import { stripeAccountBadgeFromMovement } from '@/lib/financial/stripeSync';
import { buildGatewaySyncRows, enrichGatewayRowsWithOrders, extractFloreOrderNumber, groupGatewaySyncRowsForDisplay } from '@/lib/financial/gatewaySyncRows';
import { computeGatewayQuadratura } from '@/lib/financial/gatewayQuadratura';
import { isGatewayRelatedFinecoMovement } from '@/lib/financial/gatewayBankMatch';
import { sanitizeLedgerDoubleEntryAnomalies } from '@/lib/financial/ledgerDoubleEntrySanitize';
import Stripe from 'stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FROM = new Date('2026-01-01T00:00:00.000Z');

/** GET: Stripe COM/EU + PayPal unificati, deduplicati, con date reali. */
export async function GET() {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        // Bonifica doppioni PayPal + anomalie partita doppia prima della tabella gateway
        const paypalSanitize = await sanitizeLedgerDoubleEntryAnomalies();

        const [stripeMeta, paypalStatus, stripeMovements, paypalLedger, kindOverridesState, bankLinesRaw] =
            await Promise.all([
            prisma.systemState.findUnique({ where: { key: 'finance.stripe.last_sync' } }),
            getPaypalSyncStatus(),
            prisma.stripeFinanceMovement.findMany({
                where: { createdAtStripe: { gte: FROM } },
                orderBy: { createdAtStripe: 'desc' },
                take: 2500,
            }),
            prisma.financialLedgerEntry.findMany({
                where: {
                    sourceType: 'PAYPAL_MOVEMENT',
                    accountingDate: { gte: FROM },
                    reversedAt: null,
                },
                orderBy: { accountingDate: 'desc' },
                take: 2500,
            }),
            prisma.systemState.findUnique({
                where: { key: 'finance.gateway.movement_kind_overrides' },
            }),
            prisma.bankStatementLine.findMany({
                where: { accountingDate: { gte: FROM } },
                orderBy: { accountingDate: 'desc' },
                take: 5000,
                select: {
                    id: true,
                    accountingDate: true,
                    description: true,
                    amountCents: true,
                },
            }),
        ]);

        let kindOverrides: Record<string, string> = {};
        try {
            if (kindOverridesState?.value) {
                kindOverrides = JSON.parse(kindOverridesState.value) as Record<string, string>;
            }
        } catch {
            kindOverrides = {};
        }

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

        const rowsRaw = buildGatewaySyncRows({
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
                eventCode: t.eventCode,
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

        const orderCodes = new Set<string>();
        for (const r of rowsRaw) {
            if (r.orderNumber) orderCodes.add(r.orderNumber.toUpperCase());
            const fromDesc = extractFloreOrderNumber(r.description);
            if (fromDesc) orderCodes.add(fromDesc);
            if (r.reference && /^FM-/i.test(r.reference)) orderCodes.add(r.reference.toUpperCase());
        }

        const ordersByNumber =
            orderCodes.size > 0
                ? await prisma.order.findMany({
                      where: { orderNumber: { in: [...orderCodes] }, deletedAt: null },
                      select: {
                          id: true,
                          orderNumber: true,
                          buyerFullName: true,
                          buyerEmail: true,
                      },
                  })
                : [];
        const orderMap = new Map(
            ordersByNumber
                .filter((o): o is typeof o & { orderNumber: string } => Boolean(o.orderNumber))
                .map((o) => [o.orderNumber.toUpperCase(), o])
        );

        const rowsEnriched = enrichGatewayRowsWithOrders(rowsRaw, orderMap);

        const rows = rowsEnriched.map((r) => {
            const ov = kindOverrides[r.transactionId] || kindOverrides[r.id];
            if (!ov) return r;
            const labelMap: Record<string, { kind: typeof r.movementKind; label: string }> = {
                incasso: { kind: 'incasso', label: 'Incasso Ordine' },
                commissione: { kind: 'commissione', label: 'Commissione Gateway' },
                payout: { kind: 'payout', label: 'Payout Bancario' },
                rimborso: { kind: 'rimborso', label: 'Rimborso' },
                riserva: { kind: 'riserva', label: 'Riserva' },
                altro: { kind: 'altro', label: 'Altro movimento' },
            };
            const mapped = labelMap[ov] || labelMap.altro;
            return {
                ...r,
                movementKind: mapped.kind,
                movementLabel: mapped.label,
            };
        });

        const groupedRows = groupGatewaySyncRowsForDisplay(rows);

        let stripeWalletCents: number | null = null;
        const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
        if (stripeKey) {
            try {
                const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' as any });
                const bal = await stripe.balance.retrieve();
                const eurAvailable = bal.available.find((b) => b.currency === 'eur');
                const eurPending = bal.pending.find((b) => b.currency === 'eur');
                stripeWalletCents =
                    (eurAvailable?.amount || 0) + (eurPending?.amount || 0);
            } catch {
                stripeWalletCents = null;
            }
        }

        const bankLines = bankLinesRaw
            .filter((l) => isGatewayRelatedFinecoMovement(l.description, l.amountCents))
            .map((l) => ({
                id: l.id,
                accountingDate: l.accountingDate?.toISOString() || null,
                description: l.description,
                amountCents: l.amountCents,
            }));

        const quadratura = computeGatewayQuadratura({
            rows,
            fromIso: FROM.toISOString(),
            stripeWalletCents,
            paypalWalletCents: null,
            bankLines,
        });

        return NextResponse.json({
            ok: true,
            from: FROM.toISOString(),
            rows,
            groupedRows,
            quadratura,
            finecoGatewayLineCount: bankLines.length,
            count: rows.length,
            groupedCount: groupedRows.length,
            stripeLastSyncAt: stripeMeta?.value || null,
            paypalLastSyncAt: paypalStatus.lastSyncAt,
            stripeRecordCount: stripeMovements.length,
            paypalRecordCount: paypalStatus.count,
            paypalSanitize,
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

/** POST: override tipo movimento gateway (inline edit). */
export async function POST(request: Request) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const body = (await request.json().catch(() => ({}))) as {
            action?: string;
            transactionId?: string;
            movementKind?: string;
        };
        if (body.action !== 'set_movement_kind') {
            return NextResponse.json(
                { ok: false, error: 'Usa action: "set_movement_kind"' },
                { status: 400 }
            );
        }
        const transactionId = String(body.transactionId || '').trim();
        const movementKind = String(body.movementKind || '').trim();
        const allowed = new Set([
            'incasso',
            'commissione',
            'payout',
            'rimborso',
            'riserva',
            'altro',
        ]);
        if (!transactionId || !allowed.has(movementKind)) {
            return NextResponse.json(
                { ok: false, error: 'transactionId / movementKind non validi' },
                { status: 400 }
            );
        }
        const key = 'finance.gateway.movement_kind_overrides';
        const existing = await prisma.systemState.findUnique({ where: { key } });
        const map = existing?.value
            ? (JSON.parse(existing.value) as Record<string, string>)
            : {};
        map[transactionId] = movementKind;
        await prisma.systemState.upsert({
            where: { key },
            create: { key, value: JSON.stringify(map) },
            update: { value: JSON.stringify(map) },
        });
        return NextResponse.json({ ok: true, transactionId, movementKind });
    } catch (error) {
        console.error('[sync/gateways POST]', error);
        return NextResponse.json(
            {
                ok: false,
                error: error instanceof Error ? error.message : 'Salvataggio fallito',
            },
            { status: 500 }
        );
    }
}
