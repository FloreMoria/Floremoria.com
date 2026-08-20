/**
 * GET /api/dashboard/orders/search
 * Endpoint di ricerca universale ed esaustiva degli ordini per la Dashboard e modali di collegamento.
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { getDashboardTestModeActive } from '@/lib/dashboard/testMode';
import { visibleDashboardOrdersWhere } from '@/lib/dashboardOrdersFilter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeSearchTerm(str?: string | null): string {
    if (!str) return '';
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export async function GET(request: Request) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const { searchParams } = new URL(request.url);
        const qRaw = searchParams.get('q') || '';
        const limitParam = parseInt(searchParams.get('limit') || '100', 10);
        const limit = Math.min(Math.max(limitParam, 10), 200);

        const testModeActive = await getDashboardTestModeActive();
        const baseWhere = visibleDashboardOrdersWhere(testModeActive);

        const qNorm = normalizeSearchTerm(qRaw);

        let whereClause: any = {
            ...baseWhere,
            deletedAt: null,
        };

        if (qRaw.trim()) {
            const rawTerm = qRaw.trim();
            whereClause = {
                ...whereClause,
                OR: [
                    { orderNumber: { contains: rawTerm, mode: 'insensitive' } },
                    { deceasedName: { contains: rawTerm, mode: 'insensitive' } },
                    { buyerFullName: { contains: rawTerm, mode: 'insensitive' } },
                    { buyerEmail: { contains: rawTerm, mode: 'insensitive' } },
                    { customerPhone: { contains: rawTerm, mode: 'insensitive' } },
                    { cemeteryName: { contains: rawTerm, mode: 'insensitive' } },
                    { cemeteryCity: { contains: rawTerm, mode: 'insensitive' } },
                    { deceasedProfile: { fullName: { contains: rawTerm, mode: 'insensitive' } } },
                    { user: { name: { contains: rawTerm, mode: 'insensitive' } } },
                    { user: { email: { contains: rawTerm, mode: 'insensitive' } } },
                    { partner: { shopName: { contains: rawTerm, mode: 'insensitive' } } },
                    { partner: { ownerName: { contains: rawTerm, mode: 'insensitive' } } },
                ],
            };
        }

        const orders = await prisma.order.findMany({
            where: whereClause,
            orderBy: [{ createdAt: 'desc' }],
            take: limit,
            select: {
                id: true,
                orderNumber: true,
                deceasedName: true,
                cemeteryName: true,
                cemeteryCity: true,
                buyerFullName: true,
                buyerEmail: true,
                customerPhone: true,
                deliveryDate: true,
                createdAt: true,
                status: true,
                totalPriceCents: true,
                photos: true,
                partner: {
                    select: {
                        id: true,
                        shopName: true,
                        ownerName: true,
                    },
                },
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                    },
                },
                deceasedProfile: {
                    select: {
                        id: true,
                        fullName: true,
                        cemeteryCity: true,
                    },
                },
            },
        });

        // Ulteriore filtro tollerante agli accenti lato server se fornito q
        let results = orders;
        if (qNorm) {
            results = orders.filter((o) => {
                const combinedText = normalizeSearchTerm(
                    [
                        o.orderNumber,
                        o.deceasedName,
                        o.deceasedProfile?.fullName,
                        o.buyerFullName,
                        o.buyerEmail,
                        o.customerPhone,
                        o.user?.name,
                        o.user?.email,
                        o.partner?.shopName,
                        o.partner?.ownerName,
                        o.cemeteryCity,
                        o.cemeteryName,
                    ]
                        .filter(Boolean)
                        .join(' ')
                );

                return combinedText.includes(qNorm);
            });
        }

        return NextResponse.json({
            ok: true,
            success: true,
            orders: results,
            count: results.length,
        });
    } catch (err) {
        console.error('[GET /api/dashboard/orders/search] Error:', err);
        return NextResponse.json(
            { ok: false, success: false, error: 'Errore durante la ricerca degli ordini.' },
            { status: 500 }
        );
    }
}
