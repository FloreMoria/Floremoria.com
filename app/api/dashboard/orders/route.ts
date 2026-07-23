import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { getDashboardTestModeActive } from '@/lib/dashboard/testMode';
import { createDashboardManualOrder } from '@/lib/orders/createDashboardManualOrder';
import { peekNextOrderNumber } from '@/lib/orders/orderNumber';
import { runVeraAfterDashboardManualOrder } from '@/lib/orders/triggerVeraOnDashboardManualOrder';

export const maxDuration = 120;

export async function GET(request: Request) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const orderCategory = searchParams.get('orderCategory') || 'FT';
    const deliveryProvince = searchParams.get('deliveryProvince') || 'XX';

    try {
        const preview = await peekNextOrderNumber({ orderCategory, deliveryProvince });
        return NextResponse.json({ ok: true, preview });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Errore anteprima codice.';
        return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
}

export async function POST(request: Request) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const body = await request.json();
        const testModeActive = await getDashboardTestModeActive();
        const order = await createDashboardManualOrder({
            orderCategory: String(body.orderCategory || 'FT'),
            deliveryProvince: String(body.deliveryProvince || 'XX'),
            buyerFullName: body.buyerFullName ?? null,
            buyerEmail: body.buyerEmail ?? null,
            buyerPhone: body.buyerPhone ?? null,
            deceasedName: String(body.deceasedName || ''),
            deceasedBirthDate: body.deceasedBirthDate ?? null,
            deceasedDeathDate: body.deceasedDeathDate ?? null,
            cemeteryName: String(body.cemeteryName || ''),
            cemeteryCity: String(body.cemeteryCity || ''),
            gravePosition: body.gravePosition ?? null,
            deliveryDate: body.deliveryDate ?? null,
            productId: String(body.productId || ''),
            quantity: body.quantity != null ? Number(body.quantity) : 1,
            priceCents: body.priceCents != null ? Number(body.priceCents) : null,
            accessories: Array.isArray(body.accessories) ? body.accessories : undefined,
            ticketMessage: body.ticketMessage ?? null,
            partnerId: body.partnerId ?? null,
            userId: body.userId ?? null,
            deceasedProfileId: body.deceasedProfileId ?? null,
            status: body.status ?? undefined,
            partnerPaymentStatus: body.partnerPaymentStatus ?? undefined,
            isRecurring: Boolean(body.isRecurring),
            additionalInstructions: body.additionalInstructions ?? null,
            isTest: testModeActive,
        });

        // Creazione Dashboard = pagamento già confermato → notifiche subito (dedup in workflow).
        let vera: Awaited<ReturnType<typeof runVeraAfterDashboardManualOrder>> | undefined;
        try {
            vera = await runVeraAfterDashboardManualOrder({
                orderId: order.id,
                isTest: order.isTest,
            });
        } catch (veraError) {
            console.error('[dashboard/orders POST] VERA workflow:', veraError);
            vera = { skipped: 'workflow_error' };
        }

        const veraBlocked =
            vera &&
            'customer' in vera &&
            (vera.customer.skipped === 'test_order_meta_blocked' ||
                vera.florist.skipped === 'test_order_meta_blocked' ||
                vera.customer.skipped === 'auto_notify_disabled' ||
                vera.florist.skipped === 'auto_notify_disabled');

        if (veraBlocked) {
            console.error('[dashboard/orders POST] VERA notifiche bloccate da env runtime:', vera);
        }

        return NextResponse.json({
            ok: true,
            order,
            vera,
            warning: veraBlocked
                ? 'Notifiche WhatsApp non inviate: verificare WHATSAPP_ALLOW_TEST_SENDS=1 sul deploy attivo (serve ridistribuire dopo aver aggiunto la env).'
                : undefined,
        });
    } catch (error) {
        console.error('[dashboard/orders POST]', error);
        const message = error instanceof Error ? error.message : 'Creazione ordine non riuscita.';
        return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
}
