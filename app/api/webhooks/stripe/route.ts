import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { sendFloremTransactionalMail } from '@/lib/serverMail';
import { buildOrderCustomerHtml, buildOrderStaffHtml } from '@/lib/orderEmails';
import { autoAssignKnownTombOrder } from '@/lib/deceased/autoAssignKnownTombOrder';
import { ensurePaidOrderEntities } from '@/lib/orders/ensurePaidOrderEntities';
import { runVeraPostPaymentWorkflow } from '@/lib/vera/orderWorkflow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type OrderWithItems = Prisma.OrderGetPayload<{
    include: { items: { include: { product: true } } };
}>;

async function archiveAbandonedCheckoutOrder(orderId: string) {
    await prisma.order.updateMany({
        where: {
            id: orderId,
            deletedAt: null,
            status: 'PENDING',
            partnerPaymentStatus: 'UNPAID',
        },
        data: {
            deletedAt: new Date(),
            status: 'CANCELLED',
        },
    });
}

export async function POST(request: Request) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    const key = process.env.STRIPE_SECRET_KEY?.trim();
    if (!secret || !key) {
        console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET o STRIPE_SECRET_KEY mancanti');
        return NextResponse.json({ error: 'not_configured' }, { status: 500 });
    }

    const rawBody = await request.text();
    const sig = request.headers.get('stripe-signature');
    if (!sig) {
        return NextResponse.json({ error: 'missing_signature' }, { status: 400 });
    }

    const stripe = new Stripe(key, { apiVersion: '2023-10-16' as any });

    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(rawBody, sig, secret);
    } catch (e) {
        console.error('[stripe-webhook] Verifica firma fallita:', e);
        return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });
    }

    if (event.type === 'checkout.session.expired') {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.orderId;
        if (orderId) {
            await archiveAbandonedCheckoutOrder(orderId);
            console.info('[stripe-webhook] Checkout scaduto, ordine archiviato:', orderId);
        }
        return NextResponse.json({ received: true });
    }

    if (event.type !== 'checkout.session.completed') {
        return NextResponse.json({ received: true });
    }

    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId;
    if (!orderId) {
        console.warn('[stripe-webhook] checkout.session.completed senza metadata.orderId');
        return NextResponse.json({ received: true });
    }

    let grossAmountVal: number | undefined = undefined;
    let stripeFeeVal: number | undefined = undefined;
    let netAmountVal: number | undefined = undefined;
    let stripeTransactionIdVal: string | undefined = undefined;
    let balanceDate = new Date();

    const paymentIntentId = session.payment_intent as string;
    if (paymentIntentId) {
        try {
            const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
                expand: ['latest_charge.balance_transaction'],
            });
            const charge = paymentIntent.latest_charge as Stripe.Charge | null;
            const balanceTransaction = charge?.balance_transaction as Stripe.BalanceTransaction | null;
            if (balanceTransaction) {
                grossAmountVal = balanceTransaction.amount / 100;
                stripeFeeVal = balanceTransaction.fee / 100;
                netAmountVal = balanceTransaction.net / 100;
                stripeTransactionIdVal = balanceTransaction.id;
                balanceDate = new Date(balanceTransaction.created * 1000);
                console.info('[stripe-webhook] Recuperata transazione contabile reale Stripe:', {
                    grossAmountVal,
                    stripeFeeVal,
                    netAmountVal,
                    stripeTransactionIdVal,
                });
            }
        } catch (err) {
            console.error('[stripe-webhook] Errore nel recupero balance_transaction:', err);
        }
    }

    const markPaid = await prisma.order.updateMany({
        where: { id: orderId, partnerPaymentStatus: { not: 'PAID' } },
        data: {
            partnerPaymentStatus: 'PAID',
            status: 'ACCEPTED',
            deletedAt: null,
            grossAmount: grossAmountVal,
            stripeFee: stripeFeeVal,
            netAmount: netAmountVal,
            stripeTransactionId: stripeTransactionIdVal,
        },
    });

    const isFirstPaidTransition = markPaid.count > 0;

    const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
            items: { include: { product: true } },
            partner: true,
        },
    });

    if (!order) {
        console.error('[stripe-webhook] Ordine non trovato dopo update:', orderId);
        return NextResponse.json({ received: true });
    }

    // Prima transizione a pagato: allinea DB locale, benvenuto WhatsApp VERA.
    if (isFirstPaidTransition) {
        await ensurePaidOrderEntities(orderId).catch((entityErr) => {
            console.error('[stripe-webhook] Allineamento User/Defunto fallito (non bloccante):', entityErr);
        });

        await runVeraPostPaymentWorkflow(orderId).catch((wfErr) => {
            console.error('[stripe-webhook] Workflow VERA post-pagamento fallito (non bloccante):', wfErr);
        });

        await autoAssignKnownTombOrder(orderId).catch((autoErr) => {
            console.error('[stripe-webhook] Auto-assegnazione tomba nota fallita (non bloccante):', autoErr);
        });

        // Scrittura Prima Nota contabile (Finance / Contabilità)
        if (grossAmountVal && grossAmountVal > 0) {
            try {
                const { addAccountingEntries } = await import('@/lib/financial/ledgerStore');
                const orderNumber = order.orderNumber || order.id;
                const dateStr = balanceDate.toISOString().split('T')[0];
                const grossCents = Math.round(grossAmountVal * 100);
                const feeCents = Math.round((stripeFeeVal || 0) * 100);

                const entryGrossId = `entry_stripe_gross_webhook_${order.id}`;
                const entryFeesId = `entry_stripe_fees_webhook_${order.id}`;

                const calculateVatCents = (totalCents: number, rate = 0.22): number => {
                    const net = totalCents / (1 + rate);
                    return Math.round(totalCents - net);
                };

                const entryGross = {
                    id: entryGrossId,
                    date: dateStr,
                    description: `Incasso lordo clienti tramite Stripe - Ordine ${orderNumber}`,
                    dareAccount: '50100 - Banca Qonto',
                    avereAccount: '60100 - Ricavi da Vendite',
                    amountCents: grossCents,
                    vatAmountCents: calculateVatCents(grossCents, 0.22),
                    isForeignService: false,
                    invoiceReference: orderNumber,
                    status: 'CONFIRMED' as const,
                };

                const entryFees = {
                    id: entryFeesId,
                    date: dateStr,
                    description: `Trattenuta commissioni Stripe su ordine ${orderNumber}`,
                    dareAccount: '70200 - Commissioni Stripe',
                    avereAccount: '50100 - Banca Qonto',
                    amountCents: feeCents,
                    vatAmountCents: 0,
                    isForeignService: true,
                    invoiceReference: `FEE-${orderNumber}`,
                    status: 'CONFIRMED' as const,
                };

                addAccountingEntries([entryGross, entryFees]);
                console.info('[stripe-webhook] Registrata Prima Nota per ordine pagato:', orderNumber);
            } catch (ledgerErr) {
                console.error('[stripe-webhook] Scrittura contabile fallita:', ledgerErr);
            }
        }
    }

    const staffTo = process.env.FLOREM_STAFF_ORDERS_EMAIL?.trim() || 'ordini@floremoria.com';
    const staffBcc = process.env.FLOREM_STAFF_ACCOUNTING_EMAIL?.trim() || 'contabile@floremoria.com';

    const staffHtml = buildOrderStaffHtml({ order, stripeSessionId: session.id });
    const staffResult = await sendFloremTransactionalMail({
        to: staffTo,
        bcc: staffBcc,
        subject: `Nuovo ordine pagato ${order.orderNumber || order.id}`,
        html: staffHtml,
    });
    if (!staffResult.ok) {
        console.error('[stripe-webhook] Invio email staff fallito:', {
            orderId: order.id,
            orderNumber: order.orderNumber,
            stripeSessionId: session.id,
            firstPaidTransition: isFirstPaidTransition,
            error: staffResult.error,
        });
        // Rispondiamo 500 per far ritentare Stripe: evita perdita definitiva della notifica operativa.
        return NextResponse.json({ error: 'staff_mail_failed' }, { status: 500 });
    }

    const buyer = order.buyerEmail?.trim();
    if (buyer && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyer)) {
        const customerBcc = process.env.FLOREM_CUSTOMER_RECEIPT_BCC?.trim();
        const custHtml = buildOrderCustomerHtml({ order });
        const custResult = await sendFloremTransactionalMail({
            to: buyer,
            ...(customerBcc ? { bcc: customerBcc } : {}),
            replyTo: process.env.FLOREM_MAIL_REPLY_TO?.trim() || 'assistenza@floremoria.com',
            subject: `Conferma ordine ${order.orderNumber || ''} — FloreMoria`.trim(),
            html: custHtml,
        });
        if (!custResult.ok) {
            console.error('[stripe-webhook] Invio email cliente fallito:', custResult.error);
        }
    }

    return NextResponse.json({ received: true, duplicate: !isFirstPaidTransition });
}
