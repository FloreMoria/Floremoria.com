import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { revalidatePath } from 'next/cache';
import { formatDeceasedName } from '@/lib/utils/formatDeceasedName';
import { formatPersonName } from '@/lib/utils/formatPersonName';

export const runtime = 'nodejs';

export async function PATCH(request: Request, context: any) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const { orderId } = await context.params;
        const body = await request.json();

        const data: any = {};

        if (body.deliveryDate !== undefined) {
            if (!body.deliveryDate) {
                data.deliveryDate = null;
            } else {
                const parsed = new Date(body.deliveryDate);
                data.deliveryDate = !isNaN(parsed.getTime()) ? parsed : null;
            }
        }
        if (body.cemeteryName !== undefined) data.cemeteryName = body.cemeteryName;
        if (body.cemeteryCity !== undefined) data.cemeteryCity = body.cemeteryCity;
        if (body.gravePosition !== undefined) data.gravePosition = body.gravePosition;
        if (body.status !== undefined) data.status = body.status;
        if (body.partnerPaymentStatus !== undefined) data.partnerPaymentStatus = body.partnerPaymentStatus;
        if (body.floristSettlementStatus !== undefined) data.floristSettlementStatus = body.floristSettlementStatus;
        if (body.floristCompensationEuros !== undefined) {
            const euros = Number(body.floristCompensationEuros);
            data.floristCompensationCents = !isNaN(euros) ? Math.round(euros * 100) : null;
        }
        if (body.deceasedName !== undefined) data.deceasedName = body.deceasedName ? formatDeceasedName(body.deceasedName) : '';
        if (body.buyerFullName !== undefined) data.buyerFullName = body.buyerFullName ? formatPersonName(body.buyerFullName) : null;
        if (body.ticketMessage !== undefined) data.ticketMessage = body.ticketMessage;
        if (body.additionalInstructions !== undefined) data.additionalInstructions = body.additionalInstructions;

        const updatedOrder = await prisma.order.update({
            where: { id: orderId },
            data,
            include: {
                partner: true,
                items: { include: { product: true } },
                deliveryProof: true,
            },
        });

        revalidatePath('/dashboard/fioristi');
        if (updatedOrder.partnerId) {
            revalidatePath(`/dashboard/fioristi/${updatedOrder.partnerId}`);
        }
        revalidatePath('/dashboard/orders');

        return NextResponse.json({ ok: true, order: updatedOrder });
    } catch (err) {
        console.error('[fioristi/deliveries/patch]', err);
        return NextResponse.json({ ok: false, error: 'Errore durante l\'aggiornamento dell\'ordine' }, { status: 500 });
    }
}
