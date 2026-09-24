import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { recordMemoryGardenOpen } from '@/lib/memoryGarden/trackOpen';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        let body: {
            orderId?: string | null;
            slug?: string | null;
            buyerEmail?: string | null;
            buyerName?: string | null;
        } = {};

        try {
            const text = await request.text();
            if (text?.trim()) {
                body = JSON.parse(text);
            }
        } catch {
            // body parse fallback
        }

        let orderId = body.orderId?.trim() || null;
        const slug = body.slug?.trim() || null;

        if (!orderId && slug && slug !== 'UT-DEMO') {
            // 1. Prova risoluzione per utente
            const user = await prisma.user.findFirst({
                where: { OR: [{ uniqueCode: slug }, { id: slug }] },
                select: { id: true, email: true },
            });

            if (user) {
                const latestOrder = await prisma.order.findFirst({
                    where: {
                        deletedAt: null,
                        status: { not: 'CANCELLED' },
                        OR: [
                            { userId: user.id },
                            ...(user.email ? [{ buyerEmail: { equals: user.email, mode: 'insensitive' as const } }] : []),
                        ],
                    },
                    orderBy: [{ deliveryDate: 'desc' }, { createdAt: 'desc' }],
                    select: { id: true },
                });
                if (latestOrder) orderId = latestOrder.id;
            }

            // 2. Prova risoluzione per profilo defunto
            if (!orderId) {
                const profile = await prisma.deceasedProfile.findFirst({
                    where: { deletedAt: null, OR: [{ id: slug }, { uniqueCode: slug }] },
                    select: { id: true, fullName: true },
                });

                if (profile) {
                    const latestOrder = await prisma.order.findFirst({
                        where: {
                            deletedAt: null,
                            status: { not: 'CANCELLED' },
                            OR: [
                                { deceasedProfileId: profile.id },
                                { deceasedName: { equals: profile.fullName, mode: 'insensitive' as const } },
                            ],
                        },
                        orderBy: [{ deliveryDate: 'desc' }, { createdAt: 'desc' }],
                        select: { id: true },
                    });
                    if (latestOrder) orderId = latestOrder.id;
                }
            }

            // 3. Prova risoluzione per ordine diretto
            if (!orderId) {
                const directOrder = await prisma.order.findFirst({
                    where: {
                        deletedAt: null,
                        OR: [{ id: slug }, { orderNumber: slug }, { proofFotoCode: slug }],
                    },
                    select: { id: true },
                });
                if (directOrder) orderId = directOrder.id;
            }
        }

        if (orderId) {
            await recordMemoryGardenOpen(orderId, request, {
                email: body.buyerEmail,
                name: body.buyerName,
            });
        }

        return NextResponse.json(
            { ok: true, tracked: Boolean(orderId) },
            {
                headers: {
                    'Cache-Control': 'no-store, no-cache, must-revalidate',
                    Pragma: 'no-cache',
                },
            }
        );
    } catch (error) {
        console.error('[giardino/track-open] Errore tracking:', error);
        return NextResponse.json({ ok: false }, { status: 500 });
    }
}
