import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticatePartnerV1, touchPartnerCredentialLastUsed } from '@/lib/partnerV1Auth';
import { partnerV1CorsHeaders } from '@/lib/partnerV1Cors';
import { generatePartnerTunnelOrderNumber } from '@/lib/partnerV1OrderNumber';
import { sendFloremTransactionalMail } from '@/lib/serverMail';
import { buildOrderStaffHtml } from '@/lib/orderEmails';

export const runtime = 'nodejs';

function unauthorized(request: Request) {
    return NextResponse.json(
        { error: 'Non autorizzato. Invia X-Partner-Key (public id fmp_…) e Authorization: Bearer con il segreto, oppure X-Partner-Key: publicId:secret.' },
        { status: 401, headers: { ...partnerV1CorsHeaders(request, 'POST, OPTIONS'), 'Content-Type': 'application/json' } }
    );
}

export async function OPTIONS(request: Request) {
    return new NextResponse(null, { status: 204, headers: partnerV1CorsHeaders(request, 'POST, OPTIONS') });
}

type LineItem = { productId?: string; quantity?: number };

function isNonEmptyString(v: unknown): v is string {
    return typeof v === 'string' && v.trim().length > 0;
}

export async function POST(request: Request) {
    const auth = await authenticatePartnerV1(request);
    if (!auth) return unauthorized(request);

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: 'JSON non valido.' },
            { status: 400, headers: { ...partnerV1CorsHeaders(request, 'POST, OPTIONS') } }
        );
    }

    const b = body as Record<string, unknown>;
    const partnerIdBody = typeof b.partnerId === 'string' ? b.partnerId.trim() : '';
    if (partnerIdBody && partnerIdBody !== auth.partnerId) {
        return NextResponse.json(
            { error: 'Il campo partnerId non coincide con il partner associato alla credenziale API.' },
            { status: 403, headers: { ...partnerV1CorsHeaders(request, 'POST, OPTIONS') } }
        );
    }

    const deceasedName = b.deceasedName;
    const cemeteryName = b.cemeteryName;
    const cemeteryCity = b.cemeteryCity;
    const deliveryProvince = typeof b.deliveryProvince === 'string' ? b.deliveryProvince.trim().toUpperCase().slice(0, 2) : '';
    const deliveryDateRaw = b.deliveryDate;
    const buyerFullName = b.buyerFullName;
    const buyerEmail = typeof b.buyerEmail === 'string' ? b.buyerEmail.trim().toLowerCase() : '';
    const buyerPhone = typeof b.buyerPhone === 'string' ? b.buyerPhone.trim() : undefined;
    const gravePosition = typeof b.gravePosition === 'string' ? b.gravePosition.trim() : undefined;
    const ticketMessage = typeof b.ticketMessage === 'string' ? b.ticketMessage : undefined;
    const agencyName = typeof b.agencyName === 'string' ? b.agencyName.trim().slice(0, 255) : undefined;
    const partnerNotifyEmail =
        typeof b.partnerNotifyEmail === 'string' && b.partnerNotifyEmail.trim()
            ? b.partnerNotifyEmail.trim().toLowerCase().slice(0, 255)
            : undefined;
    const lineItems = Array.isArray(b.lineItems) ? (b.lineItems as LineItem[]) : [];

    // Supporto separazione tra biglietto pulito (ticketMessage) e note operative del fiorista (additionalInstructions/specialNotes)
    const additionalInstructionsRaw = typeof b.additionalInstructions === 'string' 
        ? b.additionalInstructions.trim() 
        : (typeof b.specialNotes === 'string' ? b.specialNotes.trim() : '');
    
    // Acquisizione riferimenti pagamento Stripe Connect (B2B)
    const stripeCheckoutSessionId = typeof b.stripeCheckoutSessionId === 'string' ? b.stripeCheckoutSessionId.trim() : undefined;
    const stripePaymentIntentId = typeof b.stripePaymentIntentId === 'string' ? b.stripePaymentIntentId.trim() : undefined;
    const stripeConnectedAccountId = typeof b.stripeConnectedAccountId === 'string' ? b.stripeConnectedAccountId.trim() : undefined;
    const casperApplicationFeeAmount = typeof b.casperApplicationFeeAmount === 'number' 
        ? b.casperApplicationFeeAmount 
        : (typeof b.casperApplicationFeeAmount === 'string' ? parseFloat(b.casperApplicationFeeAmount) : undefined);

    let finalInstructions = additionalInstructionsRaw;
    if (stripeCheckoutSessionId || stripePaymentIntentId || stripeConnectedAccountId || casperApplicationFeeAmount !== undefined) {
        const stripeMeta = {
            stripeCheckoutSessionId,
            stripePaymentIntentId,
            stripeConnectedAccountId,
            casperApplicationFeeAmount
        };
        finalInstructions += (finalInstructions ? '\n\n' : '') + `---B2B_STRIPE_METADATA---\n${JSON.stringify(stripeMeta)}`;
    }

    if (!isNonEmptyString(deceasedName) || !isNonEmptyString(cemeteryName) || !isNonEmptyString(cemeteryCity)) {
        return NextResponse.json(
            { error: 'Campi obbligatori: deceasedName, cemeteryName, cemeteryCity.' },
            { status: 400, headers: { ...partnerV1CorsHeaders(request, 'POST, OPTIONS') } }
        );
    }
    if (!deliveryProvince || deliveryProvince.length !== 2) {
        return NextResponse.json(
            { error: 'deliveryProvince deve essere la sigla di 2 lettere (es. RM).' },
            { status: 400, headers: { ...partnerV1CorsHeaders(request, 'POST, OPTIONS') } }
        );
    }
    if (!isNonEmptyString(deliveryDateRaw)) {
        return NextResponse.json(
            { error: 'deliveryDate obbligatoria (formato ISO date).' },
            { status: 400, headers: { ...partnerV1CorsHeaders(request, 'POST, OPTIONS') } }
        );
    }
    const deliveryDate = new Date(String(deliveryDateRaw));
    if (Number.isNaN(deliveryDate.getTime())) {
        return NextResponse.json(
            { error: 'deliveryDate non valida.' },
            { status: 400, headers: { ...partnerV1CorsHeaders(request, 'POST, OPTIONS') } }
        );
    }
    if (!isNonEmptyString(buyerFullName) || !buyerEmail) {
        return NextResponse.json(
            { error: 'Campi obbligatori: buyerFullName, buyerEmail.' },
            { status: 400, headers: { ...partnerV1CorsHeaders(request, 'POST, OPTIONS') } }
        );
    }
    if (!lineItems.length) {
        return NextResponse.json(
            { error: 'lineItems deve contenere almeno un elemento.' },
            { status: 400, headers: { ...partnerV1CorsHeaders(request, 'POST, OPTIONS') } }
        );
    }

    const resolved: { productId: string; quantity: number; priceCents: number }[] = [];
    for (const item of lineItems) {
        const pid = typeof item.productId === 'string' ? item.productId.trim() : '';
        const qty = Math.max(1, Math.min(99, Number(item.quantity) || 1));
        if (!pid) {
            return NextResponse.json(
                { error: 'Ogni lineItem deve avere productId.' },
                { status: 400, headers: { ...partnerV1CorsHeaders(request, 'POST, OPTIONS') } }
            );
        }
        const product = await prisma.product.findFirst({
            where: { id: pid, isActive: true, deletedAt: null },
        });
        if (!product) {
            return NextResponse.json(
                { error: `Prodotto non trovato o non attivo: ${pid}` },
                { status: 400, headers: { ...partnerV1CorsHeaders(request, 'POST, OPTIONS') } }
            );
        }
        resolved.push({ productId: product.id, quantity: qty, priceCents: product.basePriceCents });
    }

    const subtotalCents = resolved.reduce((acc, r) => acc + r.priceCents * r.quantity, 0);

    const order = await prisma.$transaction(async (tx) => {
        const orderNumber = await generatePartnerTunnelOrderNumber(tx, deliveryProvince);
        return tx.order.create({
            data: {
                orderNumber,
                status: 'ACCEPTED',
                deceasedName: deceasedName.trim(),
                cemeteryName: cemeteryName.trim(),
                cemeteryCity: cemeteryCity.trim(),
                gravePosition: gravePosition || null,
                deliveryProvince,
                deliveryDate,
                ticketMessage: ticketMessage ?? null,
                additionalInstructions: finalInstructions || null,
                buyerFullName: buyerFullName.trim(),
                buyerEmail,
                customerPhone: buyerPhone || null,
                totalPriceCents: subtotalCents,
                currency: 'EUR',
                partnerId: auth.partnerId,
                agencyName: agencyName || null,
                partnerNotifyEmail: partnerNotifyEmail || null,
                items: {
                    create: resolved.map((r) => ({
                        productId: r.productId,
                        quantity: r.quantity,
                        priceCents: r.priceCents,
                    })),
                },
            },
            include: {
                items: {
                    include: {
                        product: true,
                    },
                },
                partner: true,
            },
        });
    });

    // Invio notifica email immediata allo staff (ordini@floremoria.com)
    try {
        const staffTo = process.env.FLOREM_STAFF_ORDERS_EMAIL?.trim() || 'ordini@floremoria.com';
        const staffHtml = buildOrderStaffHtml({
            order: order as any,
            stripeSessionId: stripeCheckoutSessionId || 'B2B Partner Integration',
        });

        await sendFloremTransactionalMail({
            to: staffTo,
            subject: `[B2B Partner Order] Nuovo ordine ${order.orderNumber} da ${order.partner?.shopName || 'Partner B2B'}`,
            html: staffHtml,
        });
        console.log(`[B2B Order Email] Notifica inviata a ${staffTo} per l'ordine ${order.orderNumber}`);
    } catch (mailErr) {
        console.error('[B2B Order Email Error] Errore durante l\'invio della notifica email:', mailErr);
    }

    await touchPartnerCredentialLastUsed(auth.credentialId);

    return NextResponse.json(
        {
            data: {
                orderId: order.id,
                orderNumber: order.orderNumber,
                totalPriceCents: order.totalPriceCents,
                currency: order.currency,
            },
        },
        {
            status: 201,
            headers: { ...partnerV1CorsHeaders(request, 'POST, OPTIONS'), 'Content-Type': 'application/json' },
        }
    );
}
