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

        // Pulisce anche il file locale chats_database.json per ambiente di sviluppo / locale
        try {
            const fs = require('fs');
            const path = require('path');
            const localDbPath = path.join(process.cwd(), 'chats_database.json');
            if (fs.existsSync(localDbPath)) {
                const data = fs.readFileSync(localDbPath, 'utf-8');
                const store = JSON.parse(data);
                let changed = false;
                for (const phone of Object.keys(store)) {
                    if (
                        store[phone].isTest ||
                        phone === 'whatsapp:+393287521463' ||
                        phone === 'whatsapp:+393204105305'
                    ) {
                        delete store[phone];
                        changed = true;
                    }
                }
                if (changed) {
                    fs.writeFileSync(localDbPath, JSON.stringify(store, null, 2), 'utf-8');
                }
            }
        } catch (jsonErr) {
            console.error('[dashboard/test/cleanup] local json cleanup failed (non-blocking):', jsonErr);
        }

        return NextResponse.json({ ok: true, deleted });
    } catch (error) {
        console.error('[dashboard/test/cleanup]', error);
        const message =
            error instanceof Error ? error.message : 'Eliminazione dati di test non riuscita.';
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}
