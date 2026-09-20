/**
 * Sola lettura V1–V3: twin py_/ch_ da €31,48 + report vendite Stripe + listino.
 */
import fs from 'node:fs';
import { buildGatewayCorrispettivi } from '@/lib/financial/dossierCorrispettiviBuild';
import { resolveQuarterBounds, type TaxQuarter } from '@/lib/financial/taxQuarterly';
import { italyDateKey } from '@/lib/financial/paypalSalesReport';
import prisma from '@/lib/prisma';

const TARGET_CENTS = 3148;
const PY_IDS = [
    // T2
    'py_3TZBBT4W4pZWhSUs1wFm0e3s',
    'py_3TZBFq4W4pZWhSUs13kgc1OA',
    'py_3TjJBK4W4pZWhSUs1mfvQoPS',
    'py_3TjJKX4W4pZWhSUs0BjNn3RV',
    // T3
    'py_3TpPFc4W4pZWhSUs0s0z7zvu',
    'py_3TpPJU4W4pZWhSUs1N3Am5Ht',
    'py_3TyuIF4W4pZWhSUs01ynUG53',
    'py_3TyuTV4W4pZWhSUs00PZNqwe',
    'py_3U5QyD4W4pZWhSUs1Lgk1VNp',
    'py_3U5R2d4W4pZWhSUs0IA5ZBux',
] as const;

function dayShift(isoDate: string, delta: number): string {
    const d = new Date(`${isoDate}T12:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
}

function datesAround(iso: string): string[] {
    return [dayShift(iso, -1), iso, dayShift(iso, 1)];
}

async function loadRegisterRows(quarters: TaxQuarter[]) {
    const all: Array<{
        quarter: string;
        date: string;
        transactionId: string;
        grossCents: number;
        canale: string;
        orderNumber: string;
    }> = [];
    for (const q of quarters) {
        const b = resolveQuarterBounds(2026, q);
        const built = await buildGatewayCorrispettivi({ start: b.start, end: b.end });
        for (const r of built.rows) {
            all.push({
                quarter: `T${q}`,
                date: r.date,
                transactionId: r.transactionId,
                grossCents: r.grossCents,
                canale: r.canaleIncasso,
                orderNumber: r.orderNumber,
            });
        }
    }
    return all;
}

async function main() {
    const register = await loadRegisterRows([2, 3]);

    // All Stripe movements around these txs
    const stripeMoves = await prisma.stripeFinanceMovement.findMany({
        where: {
            OR: [
                { sourceId: { in: [...PY_IDS] } },
                { stripeId: { contains: 'py_3TZ' } },
                { stripeId: { contains: 'py_3Tj' } },
                { stripeId: { contains: 'py_3Tp' } },
                { stripeId: { contains: 'py_3Ty' } },
                { stripeId: { contains: 'py_3U5' } },
                {
                    amountCents: { in: [TARGET_CENTS, -TARGET_CENTS] },
                    createdAtStripe: {
                        gte: new Date('2026-05-01'),
                        lte: new Date('2026-09-30'),
                    },
                },
            ],
        },
        select: {
            stripeId: true,
            sourceId: true,
            type: true,
            amountCents: true,
            createdAtStripe: true,
            orderId: true,
            reportingCategory: true,
            description: true,
            metadataJson: true,
        },
        take: 5000,
    });

    const normId = (s: string) => s.replace(/^stripe_(?:com|eu)_tx_/, '').replace(/^stripe_tx_/, '');

    const v1 = [];
    for (const pyId of PY_IDS) {
        const pyMove = stripeMoves.find(
            (m) => m.sourceId === pyId || normId(m.stripeId) === pyId || m.stripeId.includes(pyId)
        );
        const pyInRegister = register.find((r) => r.transactionId === pyId);
        const date = pyInRegister?.date || (pyMove ? italyDateKey(pyMove.createdAtStripe) : null);
        const amount =
            pyInRegister?.grossCents ??
            (pyMove ? Math.abs(pyMove.amountCents) : TARGET_CENTS);

        let twinCh: {
            chId: string;
            date: string;
            type: string | null;
            inRegister: boolean;
            sourceId: string | null;
            metaPaymentIntent: string | null;
        } | null = null;

        if (date) {
            const window = datesAround(date);
            // Prefer metadata link payment_intent / charge
            const meta = (pyMove?.metadataJson || {}) as Record<string, unknown>;
            const linkedCharge =
                (typeof meta.charge === 'string' && meta.charge) ||
                (typeof meta.latest_charge === 'string' && meta.latest_charge) ||
                null;
            const paymentIntent =
                (typeof meta.payment_intent === 'string' && meta.payment_intent) ||
                (typeof meta.paymentIntentId === 'string' && meta.paymentIntentId) ||
                null;

            const candidates = stripeMoves.filter((m) => {
                const sid = (m.sourceId || normId(m.stripeId) || '').toLowerCase();
                if (!sid.startsWith('ch_')) return false;
                const abs = Math.abs(m.amountCents);
                if (abs !== amount) return false;
                const md = italyDateKey(m.createdAtStripe);
                if (!window.includes(md)) return false;
                return true;
            });

            // tighter: same payment_intent in metadata
            let best = candidates[0] || null;
            if (paymentIntent) {
                const byPi = candidates.find((m) => {
                    const mm = (m.metadataJson || {}) as Record<string, unknown>;
                    return (
                        mm.payment_intent === paymentIntent ||
                        mm.paymentIntentId === paymentIntent ||
                        String(JSON.stringify(mm)).includes(paymentIntent)
                    );
                });
                if (byPi) best = byPi;
            }
            if (linkedCharge) {
                const byCh = candidates.find(
                    (m) => m.sourceId === linkedCharge || normId(m.stripeId) === linkedCharge
                );
                if (byCh) best = byCh;
            }

            if (best) {
                const chId = best.sourceId || normId(best.stripeId);
                const chDate = italyDateKey(best.createdAtStripe);
                const inReg = register.some(
                    (r) =>
                        r.transactionId === chId ||
                        r.transactionId === best!.sourceId ||
                        register.some((x) => x.transactionId === chId)
                );
                twinCh = {
                    chId,
                    date: chDate,
                    type: best.type,
                    inRegister: register.some((r) => r.transactionId === chId),
                    sourceId: best.sourceId,
                    metaPaymentIntent: paymentIntent,
                };
            }
        }

        v1.push({
            pyId,
            date,
            amountEuro: Number((amount / 100).toFixed(2)),
            pyInRegister: Boolean(pyInRegister),
            pyRegisterQuarter: pyInRegister?.quarter || null,
            pyMoveType: pyMove?.type || null,
            twinChExists: twinCh ? 'S' : 'N',
            twinChId: twinCh?.chId || null,
            twinChDate: twinCh?.date || null,
            twinChType: twinCh?.type || null,
            twinChInRegister: twinCh ? (twinCh.inRegister ? 'S' : 'N') : 'N/A',
            paymentIntentMeta:
                typeof (pyMove?.metadataJson as Record<string, unknown> | null)?.payment_intent ===
                'string'
                    ? (pyMove!.metadataJson as Record<string, unknown>).payment_intent
                    : null,
        });
    }

    // V2 — Stripe "sales" = type charge (not payment twin), count of 3148 on the ambiguous dates
    const ambiguousDates = [
        '2026-05-20',
        '2026-06-17',
        '2026-07-04',
        '2026-07-30',
        '2026-08-17',
    ];

    // Broader pull for V2
    const salesWindow = await prisma.stripeFinanceMovement.findMany({
        where: {
            createdAtStripe: {
                gte: new Date('2026-05-01'),
                lte: new Date('2026-09-30'),
            },
            amountCents: { in: [TARGET_CENTS, -TARGET_CENTS, 2999, -2999] },
        },
        select: {
            stripeId: true,
            sourceId: true,
            type: true,
            amountCents: true,
            createdAtStripe: true,
            reportingCategory: true,
        },
        take: 5000,
    });

    const v2ByDate: Record<string, unknown> = {};
    for (const d of ambiguousDates) {
        const dayMoves = salesWindow.filter(
            (m) => italyDateKey(m.createdAtStripe) === d && Math.abs(m.amountCents) === TARGET_CENTS
        );
        const charges = dayMoves.filter((m) => (m.type || '').toLowerCase() === 'charge');
        const payments = dayMoves.filter((m) => (m.type || '').toLowerCase() === 'payment');
        const other = dayMoves.filter(
            (m) => !['charge', 'payment'].includes((m.type || '').toLowerCase())
        );
        const inRegister3148 = register.filter(
            (r) => r.date === d && r.grossCents === TARGET_CENTS
        );
        v2ByDate[d] = {
            stripeChargeCount: charges.length,
            stripePaymentCount: payments.length,
            stripeOtherCount: other.length,
            chargeIds: charges.map((c) => c.sourceId || c.stripeId),
            paymentIds: payments.map((c) => c.sourceId || c.stripeId),
            registerRows3148: inRegister3148.map((r) => ({
                tx: r.transactionId,
                canale: r.canale,
                order: r.orderNumber,
            })),
            registerCount: inRegister3148.length,
            interpretation:
                charges.length > 0 && payments.length === charges.length
                    ? `Sospetto twin 1:1 — ${charges.length} charge vs ${payments.length} payment`
                    : charges.length !== payments.length
                      ? `charge=${charges.length} payment=${payments.length} (non 1:1)`
                      : 'nessuna charge',
        };
    }

    // May 11 €29.99
    const may11 = salesWindow.filter(
        (m) => italyDateKey(m.createdAtStripe) === '2026-05-11' && Math.abs(m.amountCents) === 2999
    );
    const may11Charges = may11.filter((m) => (m.type || '').toLowerCase() === 'charge');
    const may11Payments = may11.filter((m) => (m.type || '').toLowerCase() === 'payment');
    const may11InReg = register.filter((r) => r.date === '2026-05-11' && r.grossCents === 2999);

    // Also search that specific tx
    const may11Tx = await prisma.stripeFinanceMovement.findMany({
        where: {
            OR: [
                { sourceId: 'ch_3TVvy64W4pZWhSUs0qSKhm1P' },
                { stripeId: { contains: 'TVvy64' } },
            ],
        },
        select: {
            stripeId: true,
            sourceId: true,
            type: true,
            amountCents: true,
            createdAtStripe: true,
            reportingCategory: true,
            description: true,
        },
    });

    // V3 — product / orders at 3148
    const products = await prisma.product.findMany({
        where: {
            OR: [{ basePriceCents: TARGET_CENTS }],
        },
        select: {
            id: true,
            name: true,
            basePriceCents: true,
            vatRatePercent: true,
            isActive: true,
            slug: true,
        },
    });

    // Also near prices (listino variants)
    const productsNear = await prisma.product.findMany({
        where: {
            basePriceCents: { gte: 3100, lte: 3200 },
        },
        select: {
            id: true,
            name: true,
            basePriceCents: true,
            vatRatePercent: true,
            isActive: true,
            slug: true,
        },
        take: 50,
    });

    const orders3148 = await prisma.order.findMany({
        where: {
            deletedAt: null,
            isTest: false,
            totalPriceCents: TARGET_CENTS,
            createdAt: {
                gte: new Date('2026-01-01'),
                lte: new Date('2026-12-31'),
            },
        },
        select: {
            orderNumber: true,
            totalPriceCents: true,
            createdAt: true,
            status: true,
            stripeTransactionId: true,
            isRecurring: true,
            additionalInstructions: true,
            items: {
                select: {
                    priceCents: true,
                    quantity: true,
                    product: { select: { name: true, basePriceCents: true, slug: true } },
                },
            },
        },
        orderBy: { createdAt: 'asc' },
    });

    // Item-level 3148
    const orderItems3148 = await prisma.orderItem.findMany({
        where: {
            priceCents: TARGET_CENTS,
            order: {
                deletedAt: null,
                isTest: false,
                createdAt: {
                    gte: new Date('2026-01-01'),
                    lte: new Date('2026-12-31'),
                },
            },
        },
        select: {
            priceCents: true,
            quantity: true,
            product: { select: { name: true, slug: true, basePriceCents: true } },
            order: { select: { orderNumber: true, createdAt: true, totalPriceCents: true } },
        },
        take: 200,
    });

    const out = {
        V1_twin_check: v1,
        V1_summary: {
            withTwinCh: v1.filter((r) => r.twinChExists === 'S').length,
            twinAlreadyInRegister: v1.filter((r) => r.twinChInRegister === 'S').length,
            twinNotInRegister: v1.filter((r) => r.twinChInRegister === 'N').length,
            noTwin: v1.filter((r) => r.twinChExists === 'N').length,
        },
        V2_stripe_sales_by_date: v2ByDate,
        V2_may11_2999: {
            inStripeAsCharge: may11Charges.length > 0 ? 'S' : 'N',
            chargeCount: may11Charges.length,
            paymentCount: may11Payments.length,
            chargeIds: may11Charges.map((c) => c.sourceId || c.stripeId),
            paymentIds: may11Payments.map((c) => c.sourceId || c.stripeId),
            inCorrispettiviRegister: may11InReg.length > 0 ? 'S' : 'N',
            registerRows: may11InReg,
            dbHitsForTx: may11Tx,
            verdict:
                may11Charges.length > 0
                    ? 'Compare come CHARGE (= vendita Stripe) nel DB movimenti'
                    : may11Payments.length > 0
                      ? 'Solo type=payment, nessuna charge'
                      : 'Non compare tra charge/payment Stripe a €29,99 il 2026-05-11',
        },
        V3_listino_3148: {
            exactProductMatch: products,
            nearProducts: productsNear,
            orders2026WithTotal3148: {
                count: orders3148.length,
                rows: orders3148.map((o) => ({
                    orderNumber: o.orderNumber,
                    date: o.createdAt.toISOString().slice(0, 10),
                    status: o.status,
                    stripeTransactionId: o.stripeTransactionId,
                    isRecurring: o.isRecurring,
                    items: o.items.map((it) => ({
                        product: it.product?.name,
                        slug: it.product?.slug,
                        lineCents: it.priceCents,
                        qty: it.quantity,
                        productListCents: it.product?.basePriceCents,
                    })),
                })),
            },
            orderItemsLine3148: {
                count: orderItems3148.length,
                byProduct: Object.entries(
                    orderItems3148.reduce<Record<string, number>>((acc, it) => {
                        const k = it.product?.name || 'unknown';
                        acc[k] = (acc[k] || 0) + it.quantity;
                        return acc;
                    }, {})
                ).map(([name, qty]) => ({ name, qty })),
            },
        },
    };

    fs.writeFileSync('/tmp/v1v2v3-twin-check.json', JSON.stringify(out, null, 2));
    console.error('[ok] /tmp/v1v2v3-twin-check.json');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
