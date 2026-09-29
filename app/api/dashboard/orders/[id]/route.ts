import { NextResponse } from 'next/server';
import type { OrderCancellationCause } from '@prisma/client';
import prisma from '@/lib/prisma';
import { writeAdminFieldChangeLog } from '@/lib/admin/adminFieldChangeLog';
import { retryPuntoAIfBlocked } from '@/lib/vera/orderWorkflow';
import { clearVeraOperationalAlert } from '@/lib/vera/operationalAlerts';
import { cancelDashboardOrder } from '@/lib/orders/cancelOrder';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { onOrderStatusChanged } from '@/lib/orders/orderStatusFilter';
import { formatDeceasedName } from '@/lib/utils/formatDeceasedName';
import { formatPersonName } from '@/lib/utils/formatPersonName';
import {
    isWorkflowStepDone,
    parseWorkflowFlags,
} from '@/lib/vera/orderWorkflow/types';
import { resolveColleagueDelegation } from '@/lib/floristNetwork/colleagueDelegation';
import { isOrderInLeaderZone } from '@/lib/floristNetwork/findZoneLeader';

export const maxDuration = 120;

const CANCELLATION_CAUSES = new Set<OrderCancellationCause>([
    'CUSTOMER',
    'FLORIST',
    'FLOREMORIA',
    'OTHER',
]);

function isQrAdminRole(role: string): boolean {
    return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

export async function PUT(request: Request, context: any) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const { id } = await context.params;
        const body = await request.json();

        const previousOrder = await prisma.order.findUnique({
            where: { id },
            select: {
                status: true,
                partnerId: true,
                userId: true,
                gravePosition: true,
                veraAlertType: true,
                isTest: true,
                cancellationCause: true,
                veraWorkflowFlags: true,
                floristCompensationCents: true,
                coordinatorFloristId: true,
                coordinationFeeCents: true,
                deliveryProvince: true,
                deletedAt: true,
            },
        });

        const safeData: Record<string, unknown> = {};

        const validKeys = [
            'partnerPaymentStatus',
            'cemeteryName',
            'cemeteryCity',
            'gravePosition',
            'deliveryDate',
            'deceasedName',
            'deceasedBirthDate',
            'deceasedDeathDate',
            'additionalInstructions',
            'status',
            'buyerFullName',
            'customerPhone',
            'totalPriceCents',
        ];

        validKeys.forEach((k) => {
            if (body[k] !== undefined) {
                if (k === 'deceasedBirthDate' || k === 'deceasedDeathDate' || k === 'deliveryDate') {
                    if (body[k] === null || (typeof body[k] === 'string' && body[k].trim() === '')) {
                        safeData[k] = null;
                    } else if (body[k]) {
                        const parsedDate = new Date(body[k]);
                        safeData[k] = Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
                    }
                } else if (k === 'deceasedName') {
                    safeData.deceasedName = body.deceasedName ? formatDeceasedName(body.deceasedName) : '';
                } else if (k === 'buyerFullName') {
                    safeData.buyerFullName = body.buyerFullName
                        ? formatPersonName(body.buyerFullName)
                        : null;
                } else {
                    safeData[k] = body[k];
                }
            }
        });

        if (body.ticketMessage !== undefined) {
            const raw =
                typeof body.ticketMessage === 'string' ? body.ticketMessage.trim() : body.ticketMessage;
            safeData.ticketMessage = raw ? String(raw) : null;
        }

        if (body.specialNotes !== undefined || body.additionalInstructions !== undefined) {
            let newNotes =
                body.specialNotes !== undefined ? body.specialNotes : body.additionalInstructions;

            try {
                const existingOrder = await prisma.order.findUnique({
                    where: { id },
                    select: { additionalInstructions: true },
                });
                if (
                    existingOrder?.additionalInstructions &&
                    existingOrder.additionalInstructions.includes('---B2B_STRIPE_METADATA---')
                ) {
                    const parts = existingOrder.additionalInstructions.split('---B2B_STRIPE_METADATA---');
                    const metadataBlock = parts[1];
                    newNotes =
                        String(newNotes).trim() +
                        `\n\n---B2B_STRIPE_METADATA---\n` +
                        metadataBlock.trim();
                }
            } catch (err) {
                console.error('Error preserving B2B Stripe metadata:', err);
            }

            safeData.additionalInstructions = newNotes;
        }

        if (body.status !== undefined) {
            let s = String(body.status).trim();
            if (s === 'WAITING') s = 'PENDING';
            if (s === 'PAID') s = 'PAID_TO_DELIVER';
            if (s === 'GDM_PLANNED' || s === 'GDM_ANNIVERSARY') s = 'IN_PROGRESS';

            const validOrderStatuses = [
                'PENDING',
                'ACCEPTED',
                'IN_PROGRESS',
                'DELIVERING',
                'DELIVERED_UNPAID',
                'PAID_TO_DELIVER',
                'COMPLETED',
                'CANCELLED',
            ];
            if (validOrderStatuses.includes(s)) {
                safeData.status = s;
            }
        }

        if (body.partnerId !== undefined) {
            if (body.partnerId && String(body.partnerId).trim()) {
                safeData.partner = { connect: { id: String(body.partnerId).trim() } };
            } else if (previousOrder?.partnerId) {
                safeData.partner = { disconnect: true };
            }
        }
        if (body.userId !== undefined) {
            if (body.userId && String(body.userId).trim()) {
                safeData.user = { connect: { id: String(body.userId).trim() } };
            } else if (previousOrder?.userId) {
                safeData.user = { disconnect: true };
            }
        }

        if (body.isTest !== undefined) {
            safeData.isTest = Boolean(body.isTest);
        }
        if (body.cancellationCause !== undefined) {
            if (body.cancellationCause === null || body.cancellationCause === '') {
                safeData.cancellationCause = null;
            } else {
                const cause = String(body.cancellationCause).trim().toUpperCase();
                if (CANCELLATION_CAUSES.has(cause as OrderCancellationCause)) {
                    safeData.cancellationCause = cause as OrderCancellationCause;
                }
            }
        }

        if (body.floristCompensationCents !== undefined && isQrAdminRole(auth.role)) {
            if (body.floristCompensationCents === null || body.floristCompensationCents === '') {
                safeData.floristCompensationCents = null;
            } else {
                const n = Number(body.floristCompensationCents);
                if (Number.isFinite(n) && n >= 0) {
                    safeData.floristCompensationCents = Math.round(n);
                }
            }
        }

        let wantsDelegationToggle: boolean | undefined;
        if (body.delegatedToColleague !== undefined) {
            if (!isQrAdminRole(auth.role)) {
                return NextResponse.json(
                    { error: 'Solo Admin / Super Admin possono modificare l’affido a collega.' },
                    { status: 403 }
                );
            }
            wantsDelegationToggle = Boolean(body.delegatedToColleague);
        }

        if (safeData.isTest === true && previousOrder && !previousOrder.isTest) {
            const flags = parseWorkflowFlags(previousOrder.veraWorkflowFlags);
            if (!isWorkflowStepDone(flags, 'puntoA_florist')) {
                safeData.veraWorkflowFlags = {
                    ...flags,
                    puntoA_florist: new Date().toISOString(),
                    puntoA_florist_skipped_test: true,
                };
                delete (safeData.veraWorkflowFlags as Record<string, unknown>).puntoA_florist_deferred;
            }
        }

        if (safeData.status === 'CANCELLED') {
            const cancelled = await cancelDashboardOrder(id);
            return NextResponse.json(cancelled);
        }

        const nextPartnerId =
            body.partnerId !== undefined
                ? body.partnerId && String(body.partnerId).trim()
                    ? String(body.partnerId).trim()
                    : null
                : previousOrder?.partnerId || null;
        const nextCompensation =
            safeData.floristCompensationCents !== undefined
                ? (safeData.floristCompensationCents as number | null)
                : previousOrder?.floristCompensationCents;
        const currentlyDelegated = Boolean(
            previousOrder?.coordinatorFloristId && (previousOrder?.coordinationFeeCents || 0) > 0
        );
        const delegatedDesired =
            wantsDelegationToggle !== undefined ? wantsDelegationToggle : currentlyDelegated;

        if (wantsDelegationToggle !== undefined || safeData.floristCompensationCents !== undefined) {
            const zone = await isOrderInLeaderZone({
                partnerId: nextPartnerId,
                deliveryProvince: previousOrder?.deliveryProvince,
            });
            if (wantsDelegationToggle === true && !zone.ok) {
                return NextResponse.json(
                    {
                        error:
                            'Spunta «Affidato a collega» disponibile solo su ordini assegnati al Leader nella sua zona.',
                    },
                    { status: 400 }
                );
            }
            const resolved = await resolveColleagueDelegation({
                delegatedToColleague: zone.ok ? delegatedDesired : false,
                partnerId: nextPartnerId,
                floristCompensationCents: nextCompensation,
                isTest: safeData.isTest !== undefined ? Boolean(safeData.isTest) : previousOrder?.isTest,
                status: (safeData.status as string) || previousOrder?.status,
                cancellationCause:
                    safeData.cancellationCause !== undefined
                        ? (safeData.cancellationCause as OrderCancellationCause | null)
                        : previousOrder?.cancellationCause,
                deletedAt: previousOrder?.deletedAt,
            });
            safeData.coordinationFeeCents = resolved.coordinationFeeCents;
            if (resolved.coordinatorFloristId === null) {
                if (previousOrder?.coordinatorFloristId) {
                    safeData.coordinatorFlorist = { disconnect: true };
                }
            } else {
                safeData.coordinatorFlorist = { connect: { id: resolved.coordinatorFloristId } };
            }
        }

        let updatedOrder;
        try {
            updatedOrder = await prisma.order.update({
                where: { id },
                data: safeData,
            });
        } catch (dbError: unknown) {
            const message = dbError instanceof Error ? dbError.message : String(dbError);
            console.error('[orders-put] Errore prisma.order.update:', dbError);
            return NextResponse.json(
                { error: 'Errore aggiornamento stato nel database', details: message },
                { status: 500 }
            );
        }

        const auditJobs: Promise<void>[] = [];
        const pushAudit = (field: string, before: unknown, after: unknown) => {
            if (Object.is(before, after)) return;
            if (before === after) return;
            auditJobs.push(
                writeAdminFieldChangeLog({
                    actorUserId: auth.userId,
                    actorRole: auth.role,
                    entityType: 'Order',
                    entityId: id,
                    field,
                    before,
                    after,
                })
            );
        };

        if (previousOrder) {
            if (safeData.isTest !== undefined) {
                pushAudit('isTest', previousOrder.isTest, updatedOrder.isTest);
            }
            if (safeData.cancellationCause !== undefined) {
                pushAudit(
                    'cancellationCause',
                    previousOrder.cancellationCause,
                    updatedOrder.cancellationCause
                );
            }
            if (body.partnerId !== undefined) {
                pushAudit('partnerId', previousOrder.partnerId, updatedOrder.partnerId);
            }
            if (safeData.floristCompensationCents !== undefined) {
                pushAudit(
                    'floristCompensationCents',
                    previousOrder.floristCompensationCents,
                    updatedOrder.floristCompensationCents
                );
            }
            if (
                wantsDelegationToggle !== undefined ||
                safeData.floristCompensationCents !== undefined
            ) {
                pushAudit(
                    'delegatedToColleague',
                    currentlyDelegated,
                    Boolean(
                        updatedOrder.coordinatorFloristId &&
                            (updatedOrder.coordinationFeeCents || 0) > 0
                    )
                );
                pushAudit(
                    'coordinatorFloristId',
                    previousOrder.coordinatorFloristId,
                    updatedOrder.coordinatorFloristId
                );
                pushAudit(
                    'coordinationFeeCents',
                    previousOrder.coordinationFeeCents,
                    updatedOrder.coordinationFeeCents
                );
            }
        }
        if (auditJobs.length > 0) {
            await Promise.all(auditJobs).catch((auditErr) => {
                console.error('[orders-put] AdminFieldChangeLog fallito (non bloccante):', auditErr);
            });
        }

        const nextStatus =
            typeof safeData.status === 'string' ? safeData.status : previousOrder?.status;

        const partnerAssignedOrChanged =
            body.partnerId !== undefined && body.partnerId !== previousOrder?.partnerId;
        const statusChanged = nextStatus && nextStatus !== previousOrder?.status;

        if (statusChanged || partnerAssignedOrChanged) {
            try {
                await onOrderStatusChanged(id, nextStatus || 'IN_PROGRESS');
            } catch (err) {
                console.error('[orders-put] Errore chiamata onOrderStatusChanged:', err);
            }
        }

        const nextGrave =
            body.gravePosition !== undefined
                ? String(body.gravePosition || '').trim()
                : String(previousOrder?.gravePosition || '').trim();
        const graveJustFilled =
            body.gravePosition !== undefined &&
            Boolean(nextGrave) &&
            !String(previousOrder?.gravePosition || '').trim();
        const gravePresentWithStaleAlert =
            Boolean(nextGrave) &&
            (previousOrder?.veraAlertType === 'grave_position_missing' ||
                previousOrder?.veraAlertType === 'punto_a_send_failed');

        if (graveJustFilled || gravePresentWithStaleAlert) {
            void clearVeraOperationalAlert(id)
                .then(() => retryPuntoAIfBlocked(id))
                .catch((err) => {
                    console.error('[orders-put] Retry Punto A dopo gravePosition fallito:', err);
                });
        }

        return NextResponse.json(updatedOrder);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error updating order:', error);
        return NextResponse.json(
            { error: 'Errore aggiornamento stato nel database', details: message },
            { status: 500 }
        );
    }
}

export async function DELETE(_request: Request, context: any) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const { id } = await context.params;
        const cancelled = await cancelDashboardOrder(id);
        return NextResponse.json({ ok: true, order: cancelled });
    } catch (error) {
        console.error('Error deleting order:', error);
        return NextResponse.json({ ok: false, error: 'Failed to delete order' }, { status: 500 });
    }
}
