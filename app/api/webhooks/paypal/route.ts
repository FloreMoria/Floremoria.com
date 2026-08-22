import { NextResponse } from 'next/server';
import {
    processPaypalWebhookEvent,
    verifyPaypalWebhookSignature,
    type PaypalWebhookEvent,
} from '@/lib/financial/paypalWebhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    const rawBody = await request.text();

    let event: PaypalWebhookEvent;
    try {
        event = JSON.parse(rawBody) as PaypalWebhookEvent;
    } catch {
        console.warn('[paypal-webhook] JSON non valido');
        return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }

    const skipVerify = process.env.PAYPAL_WEBHOOK_SKIP_VERIFY === '1';
    if (!skipVerify) {
        const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
        const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();
        if (!clientId || !clientSecret) {
            console.error('[paypal-webhook] PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET mancanti');
            return NextResponse.json({ error: 'not_configured' }, { status: 500 });
        }

        const verified = await verifyPaypalWebhookSignature(event, request.headers);
        if (!verified) {
            console.warn('[paypal-webhook] Firma webhook non valida', {
                eventType: event.event_type,
                eventId: event.id,
            });
            return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
        }
    }

    try {
        const result = await processPaypalWebhookEvent(event);
        console.info('[paypal-webhook] Evento elaborato', {
            eventType: result.eventType,
            inserted: result.inserted,
            skipped: result.skipped,
            ignored: result.ignored,
        });
    } catch (err) {
        // PayPal richiede 200 per evitare retry infiniti su errori di business già loggati
        console.error('[paypal-webhook] Elaborazione fallita (ack 200):', err);
    }

    return NextResponse.json({ received: true });
}
