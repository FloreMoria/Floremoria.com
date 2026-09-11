/**
 * Registrazione carnet Isabella Cesaroni + storno pose + correzione falso positivo Giulio.
 * Perché: incasso Stripe 03/05 €284,90 senza ordine; pose €25,90 gonfiavano taxRegister T3.
 *
 * Uso: npx tsx scripts/register-isabella-carnet-2026-05-03.ts
 *       DRY_RUN=1 npx tsx scripts/register-isabella-carnet-2026-05-03.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();
if (process.env.DATABASE_URL_UNPOOLED) {
    process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
}

import { OrderStatus, PaymentStatus } from '@prisma/client';
import prisma from '@/lib/prisma';
import { allocateOrderNumberInTransaction } from '@/lib/orders/orderNumber';
import { buildGatewayCorrispettivi } from '@/lib/financial/dossierCorrispettiviBuild';
import { buildTaxRegisterReport } from '@/lib/financial/taxRegister';
import { isPrepaidSubscriptionPoseOrder } from '@/lib/financial/prepaidSubscriptionOrders';

const DRY = process.env.DRY_RUN === '1';
const STRIPE_ID = 'stripe_eu_tx_txn_3TSzMsRrkwwcYwep11EAvI3P';
const PRODUCT_ID = 'cmpcb2j2l0002jv046f7zppyb'; // Ricordo Affettuoso (attivo, IVA 10%)
const POSE_NUMBERS = ['FT-MC-26-003', 'FT-MC-26-004', 'FT-MC-26-005', 'FT-MC-26-006'];
const TODAY = '2026-09-11';

async function t2NoOrderStats() {
    const corr = await buildGatewayCorrispettivi({
        start: new Date('2026-04-01T00:00:00.000Z'),
        end: new Date('2026-06-30T23:59:59.999Z'),
    });
    const noOrder = corr.rows.filter((r) => !r.orderId);
    const sum = noOrder.reduce((s, r) => s + (r.grossCents || 0), 0);
    const has284 = noOrder.some((r) => (r.grossCents || 0) === 28490);
    return { n: noOrder.length, sumCents: sum, has284 };
}

async function main() {
    const beforeT2 = await t2NoOrderStats();
    const beforeTax = await buildTaxRegisterReport({ year: 2026, mode: 'quarter', quarter: 3 });
    console.log(
        JSON.stringify(
            {
                dry: DRY,
                beforeT2,
                beforeTaxT3: {
                    rows: beforeTax.rows.length,
                    gross: beforeTax.summary.grossCents / 100,
                    iva: beforeTax.summary.ivaDebitoCents / 100,
                    floralImp: beforeTax.summary.floralImponibileCents / 100,
                },
            },
            null,
            2
        )
    );

    if (beforeT2.n !== 45 || !beforeT2.has284) {
        console.error(
            `STOP accettazione pre: attesi 45 no-order T2 con €284,90; got n=${beforeT2.n} has284=${beforeT2.has284}`
        );
        process.exit(2);
    }

    const stripe = await prisma.stripeFinanceMovement.findFirst({
        where: { stripeId: STRIPE_ID },
    });
    if (!stripe) throw new Error(`Stripe movement ${STRIPE_ID} non trovato`);
    if (stripe.orderId) throw new Error(`Stripe già collegato a orderId=${stripe.orderId}`);
    if (stripe.amountCents !== 28490) {
        throw new Error(`Importo Stripe ${stripe.amountCents} ≠ 28490`);
    }

    const existingTx = await prisma.order.findFirst({
        where: { stripeTransactionId: STRIPE_ID, deletedAt: null },
    });
    if (existingTx) throw new Error(`Ordine già collegato a TX: ${existingTx.orderNumber}`);

    const poses = await prisma.order.findMany({
        where: { orderNumber: { in: POSE_NUMBERS }, deletedAt: null },
        include: { items: true },
    });
    if (poses.length !== 4) throw new Error(`Attese 4 pose attive, trovate ${poses.length}`);

    const giulio = await prisma.order.findFirst({
        where: { orderNumber: 'FF-PD-26-004', deletedAt: null },
    });
    if (!giulio) throw new Error('FF-PD-26-004 non trovato');
    const giulioWasPose = isPrepaidSubscriptionPoseOrder(giulio);

    const createdAt = new Date(Date.UTC(2026, 4, 3, 12, 46, 0)); // 03/05/2026 ~ ora Stripe
    const carnetNote =
        `CARNET_PREPAGATO: Carnet Ricordo Affettuoso (prodotto dismesso) · 11 consegne · ` +
        `IVA 10% (imponibile €259,00 + IVA €25,90) · destinatario Anna Maria Rumori · ` +
        `Cimitero comunale di Civitanova Alta (MC) · abbinato ${STRIPE_ID}`;

    let carnetOrderNumber: string | null = null;
    let carnetOrderId: string | null = null;

    if (!DRY) {
        const created = await prisma.$transaction(async (tx) => {
            const orderNumber = await allocateOrderNumberInTransaction(tx, 'FT', 'MC', createdAt);
            const order = await tx.order.create({
                data: {
                    createdAt,
                    updatedAt: createdAt,
                    orderNumber,
                    buyerFullName: 'Isabella Cesaroni',
                    buyerEmail: 'isa.cesaroni@gmail.com',
                    customerPhone: '+4915775944828',
                    userId: 'cmr3ak7ke0000jp04l9aexqvg',
                    deceasedName: 'Anna Maria Rumori',
                    cemeteryName: 'Cimitero comunale di Civitanova Alta (MC)',
                    cemeteryCity: 'Civitanova Alta (MC)',
                    deliveryProvince: 'MC',
                    totalPriceCents: 28490,
                    grossAmount: 284.9,
                    stripeFee: (stripe.feeCents || 0) / 100,
                    netAmount: (stripe.netCents || 0) / 100,
                    partnerPaymentStatus: PaymentStatus.PAID,
                    status: OrderStatus.COMPLETED,
                    confirmationMessageSent: true,
                    isRecurring: false,
                    isTest: false,
                    stripeTransactionId: STRIPE_ID,
                    paymentMethodLabel: 'stripe_eu',
                    partnerId: poses[0]?.partnerId || null,
                    additionalInstructions:
                        `IMPORT_MANUALE: registrazione carnet ${TODAY} | ${carnetNote}`,
                    financeNotes:
                        `batch=CARNET_ISABELLA_${TODAY}; gateway=${STRIPE_ID}; ` +
                        `DOSSIER_ECCEZIONE: Carnet prepagato registrato ${TODAY}: ricavo IVA intero al pagamento ` +
                        `€284,90 (03/05/2026); pose successive esecuzione a €0 (prodotto dismesso, unico carnet residuo).`,
                    items: {
                        create: [
                            {
                                productId: PRODUCT_ID,
                                quantity: 1,
                                priceCents: 28490,
                            },
                        ],
                    },
                },
                select: { id: true, orderNumber: true },
            });

            const linked = await tx.stripeFinanceMovement.updateMany({
                where: { stripeId: STRIPE_ID, orderId: null },
                data: { orderId: order.id },
            });
            if (linked.count !== 1) {
                throw new Error(`Link Stripe fallito: update count=${linked.count}`);
            }

            for (const pose of poses) {
                const wasPaidMark = pose.partnerPaymentStatus === 'PAID';
                const storno =
                    `ESECUZIONE_CARNET:${order.orderNumber} | ` +
                    `STORNO_RICAVO_${TODAY}: totale portato a €0 (era €${(pose.totalPriceCents / 100).toFixed(2)}); ` +
                    `non è incasso cliente — esecuzione consegna su carnet prepagato. ` +
                    (wasPaidMark
                        ? `partnerPaymentStatus era PAID (liquidazione fiorista, non ricavo): lasciato invariato sul costo vivo. `
                        : '') +
                    `DOSSIER_ECCEZIONE: Storno ricavo fittizio posa ${pose.orderNumber} €${(pose.totalPriceCents / 100).toFixed(2)} ` +
                    `→ €0 collegata a ${order.orderNumber}; non cancellata.`;

                await tx.order.update({
                    where: { id: pose.id },
                    data: {
                        totalPriceCents: 0,
                        grossAmount: null,
                        isRecurring: true,
                        financeNotes: [pose.financeNotes, storno].filter(Boolean).join(' | '),
                        additionalInstructions: [
                            pose.additionalInstructions,
                            `ESECUZIONE_CARNET:${order.orderNumber}`,
                        ]
                            .filter(Boolean)
                            .join(' | '),
                    },
                });
                for (const item of pose.items) {
                    if (item.priceCents !== 0) {
                        await tx.orderItem.update({
                            where: { id: item.id },
                            data: { priceCents: 0 },
                        });
                    }
                }
            }

            // Falso positivo filtro pose: vendita Abbraccio Verde con Stripe 09/07 non collegato;
            // isRecurring=true la escludeva dai ricavi senza essere esecuzione di un prepagato.
            await tx.order.update({
                where: { id: giulio.id },
                data: {
                    isRecurring: false,
                    financeNotes: [
                        giulio.financeNotes,
                        `CORREZIONE_${TODAY}: isRecurring false positive (non posa prepagata; ` +
                            `vendita singola Abbraccio Verde €39,99). Stripe candidato ` +
                            `stripe_eu_tx_txn_3TrNudRrkwwcYwep0zY0M7LI del 09/07 ancora da abbinare separatamente.`,
                    ]
                        .filter(Boolean)
                        .join(' | '),
                },
            });

            return order;
        });

        carnetOrderId = created.id;
        carnetOrderNumber = created.orderNumber;
    } else {
        carnetOrderNumber = '(dry-run)';
    }

    const afterT2 = await t2NoOrderStats();
    const afterTax = await buildTaxRegisterReport({ year: 2026, mode: 'quarter', quarter: 3 });
    const giulioAfter = await prisma.order.findFirst({
        where: { orderNumber: 'FF-PD-26-004' },
        select: {
            isRecurring: true,
            stripeTransactionId: true,
            additionalInstructions: true,
            financeNotes: true,
            totalPriceCents: true,
            paymentMethodLabel: true,
            grossAmount: true,
        },
    });

    const deltaNoOrder = beforeT2.n - afterT2.n;
    const deltaSum = beforeT2.sumCents - afterT2.sumCents;
    const acceptOk = !DRY && deltaNoOrder === 1 && deltaSum === 28490 && !afterT2.has284;

    console.log(
        JSON.stringify(
            {
                carnetOrderNumber,
                carnetOrderId,
                giulioWasPose,
                giulioAfterPose: giulioAfter
                    ? isPrepaidSubscriptionPoseOrder(giulioAfter)
                    : null,
                afterT2,
                deltaNoOrder,
                deltaSumEuro: deltaSum / 100,
                acceptOk,
                afterTaxT3: {
                    rows: afterTax.rows.length,
                    gross: afterTax.summary.grossCents / 100,
                    iva: afterTax.summary.ivaDebitoCents / 100,
                    floralImp: afterTax.summary.floralImponibileCents / 100,
                    deltaRows: beforeTax.rows.length - afterTax.rows.length,
                    deltaGross: (beforeTax.summary.grossCents - afterTax.summary.grossCents) / 100,
                    deltaIva: (beforeTax.summary.ivaDebitoCents - afterTax.summary.ivaDebitoCents) / 100,
                },
                posesAfter: DRY
                    ? null
                    : (
                          await prisma.order.findMany({
                              where: { orderNumber: { in: POSE_NUMBERS } },
                              select: {
                                  orderNumber: true,
                                  totalPriceCents: true,
                                  partnerPaymentStatus: true,
                                  isRecurring: true,
                              },
                          })
                      ),
            },
            null,
            2
        )
    );

    if (!DRY && !acceptOk) {
        console.error(
            `STOP accettazione post: atteso no-order 45→44 e −€284,90; got Δn=${deltaNoOrder} Δ€=${deltaSum / 100}`
        );
        process.exit(3);
    }

    await prisma.$disconnect();
}

main().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
