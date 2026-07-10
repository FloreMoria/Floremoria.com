import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';

export async function POST() {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    if (!process.env.DATABASE_URL?.trim()) {
        return NextResponse.json(
            { ok: false, error: 'Database non configurato.' },
            { status: 503 }
        );
    }

    try {
        const deleted = await prisma.$transaction(async (tx) => {
            const memoryGardenOpens = await tx.memoryGardenOpen.deleteMany({
                where: { order: { isTest: true } },
            });
            const offerRedemptions = await tx.offerRedemption.deleteMany({
                where: { order: { isTest: true } },
            });
            const deliveryProofs = await tx.deliveryProof.deleteMany({
                where: { order: { isTest: true } },
            });
            const orderItems = await tx.orderItem.deleteMany({
                where: { order: { isTest: true } },
            });
            const orders = await tx.order.deleteMany({ where: { isTest: true } });
            const chatSessions = await tx.whatsAppChatSession.deleteMany({
                where: { isTest: true },
            });
            const users = await tx.user.deleteMany({
                where: {
                    isTest: true,
                    OR: [{ orders: { none: {} } }, { orders: { every: { isTest: true } } }],
                },
            });

            return {
                memoryGardenOpens: memoryGardenOpens.count,
                offerRedemptions: offerRedemptions.count,
                deliveryProofs: deliveryProofs.count,
                orderItems: orderItems.count,
                orders: orders.count,
                chatSessions: chatSessions.count,
                users: users.count,
            };
        });

        return NextResponse.json({ ok: true, deleted });
    } catch (error) {
        console.error('[dashboard/test/cleanup]', error);
        const message =
            error instanceof Error ? error.message : 'Eliminazione dati di test non riuscita.';
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}
