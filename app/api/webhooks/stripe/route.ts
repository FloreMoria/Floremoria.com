import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { sendFloremTransactionalMail } from '@/lib/serverMail';
import { buildOrderCustomerHtml, buildOrderStaffHtml } from '@/lib/orderEmails';

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

    const markPaid = await prisma.order.updateMany({
        where: { id: orderId, partnerPaymentStatus: { not: 'PAID' } },
        data: { partnerPaymentStatus: 'PAID', status: 'ACCEPTED' },
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
