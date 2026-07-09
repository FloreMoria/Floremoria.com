import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface StaffAlertsSummary {
    inboundMessageCount: number;
    paidOrderCount: number;
    deliveryProofCompletedCount: number;
    floristInboundMediaCount: number;
}

/**
 * GET /api/dashboard/staff-alerts/summary
 * Snapshot leggero per polling suoni dashboard (messaggi, ordini, foto fioristi).
 */
export async function GET() {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    if (!process.env.DATABASE_URL?.trim()) {
        return NextResponse.json({
            success: true,
            degraded: true,
            summary: {
                inboundMessageCount: 0,
                paidOrderCount: 0,
                deliveryProofCompletedCount: 0,
                floristInboundMediaCount: 0,
            } satisfies StaffAlertsSummary,
        });
    }

    try {
        const [
            inboundMessageCount,
            paidOrderCount,
            deliveryProofCompletedCount,
            floristInboundMediaCount,
        ] = await Promise.all([
            prisma.whatsAppChatMessage.count({ where: { direction: 'INBOUND' } }),
            prisma.order.count({
                where: {
                    deletedAt: null,
                    partnerPaymentStatus: 'PAID',
                    orderNumber: { not: null },
                },
            }),
            prisma.deliveryProof.count({ where: { status: 'COMPLETED' } }),
            prisma.whatsAppChatMessage.count({
                where: {
                    direction: 'INBOUND',
                    mediaUrl: { not: null },
                    session: { userType: 'FLORIST' },
                },
            }),
        ]);

        const summary: StaffAlertsSummary = {
            inboundMessageCount,
            paidOrderCount,
            deliveryProofCompletedCount,
            floristInboundMediaCount,
        };

        return NextResponse.json({ success: true, summary });
    } catch (error) {
        console.error('[staff-alerts/summary]', error);
        return NextResponse.json(
            { success: false, error: 'Errore lettura alert staff.' },
            { status: 500 }
        );
    }
}
