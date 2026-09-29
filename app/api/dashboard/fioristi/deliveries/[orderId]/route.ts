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
        if (body.partnerPaymentStatus !== undefined) {
            data.partnerPaymentStatus = body.partnerPaymentStatus;
        }
        if (body.floristSettlementStatus !== undefined) data.floristSettlementStatus = body.floristSettlementStatus;
        if (body.floristCompensationEuros !== undefined) {
            const euros = Number(body.floristCompensationEuros);
            data.floristCompensationCents = !isNaN(euros) ? Math.round(euros * 100) : null;
        }
        if (body.deceasedName !== undefined) data.deceasedName = body.deceasedName ? formatDeceasedName(body.deceasedName) : '';
        if (body.buyerFullName !== undefined) data.buyerFullName = body.buyerFullName ? formatPersonName(body.buyerFullName) : null;
        if (body.ticketMessage !== undefined) data.ticketMessage = body.ticketMessage;
        if (body.additionalInstructions !== undefined) data.additionalInstructions = body.additionalInstructions;

        const previous = await prisma.order.findUnique({
            where: { id: orderId },
            select: {
                floristCompensationCents: true,
                coordinatorFloristId: true,
                coordinationFeeCents: true,
                partnerId: true,
                isTest: true,
                status: true,
                cancellationCause: true,
                deletedAt: true,
                deliveryProvince: true,
                partnerPaymentStatus: true,
                paidAt: true,
            },
        });

        if (
            previous &&
            data.partnerPaymentStatus === 'PAID' &&
            previous.partnerPaymentStatus !== 'PAID' &&
            !previous.paidAt
        ) {
            data.paidAt = new Date();
        }

        // Se già affidato a collega, ricalcola il 10% al cambio compenso (Operazione 4).
        if (
            previous &&
            data.floristCompensationCents !== undefined &&
            previous.coordinatorFloristId &&
            (previous.coordinationFeeCents || 0) > 0
        ) {
            const { resolveColleagueDelegation } = await import(
                '@/lib/floristNetwork/colleagueDelegation'
            );
            const { writeAdminFieldChangeLog } = await import('@/lib/admin/adminFieldChangeLog');
            const resolved = await resolveColleagueDelegation({
                delegatedToColleague: true,
                partnerId: previous.partnerId,
                floristCompensationCents: data.floristCompensationCents,
                isTest: previous.isTest,
                status: previous.status,
                cancellationCause: previous.cancellationCause,
                deletedAt: previous.deletedAt,
            });
            if (resolved.coordinatorFloristId) {
                data.coordinatorFlorist = { connect: { id: resolved.coordinatorFloristId } };
            } else if (previous.coordinatorFloristId) {
                data.coordinatorFlorist = { disconnect: true };
            }
            data.coordinationFeeCents = resolved.coordinationFeeCents;

            await writeAdminFieldChangeLog({
                actorUserId: auth.userId,
                actorRole: auth.role,
                entityType: 'Order',
                entityId: orderId,
                field: 'floristCompensationCents',
                before: previous.floristCompensationCents,
                after: data.floristCompensationCents,
            }).catch(() => undefined);
            await writeAdminFieldChangeLog({
                actorUserId: auth.userId,
                actorRole: auth.role,
                entityType: 'Order',
                entityId: orderId,
                field: 'coordinationFeeCents',
                before: previous.coordinationFeeCents,
                after: resolved.coordinationFeeCents,
            }).catch(() => undefined);
        }

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
