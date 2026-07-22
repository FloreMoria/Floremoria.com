import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { isDashboardAdminRole } from '@/lib/superAdmin';
import { hasValidAdminApiKeyHeader } from '@/lib/auth/verbaleSyncAuth';

/**
 * Auth API buoni: cookie staff dashboard (ADMIN/SUPER_ADMIN) oppure x-admin-key.
 * Perché: la UI /dashboard/offers non invia x-admin-key — solo sessione cookie.
 */
async function requireOffersApiAuth(request: Request): Promise<NextResponse | null> {
    if (hasValidAdminApiKeyHeader(request.headers.get('x-admin-key'))) {
        return null;
    }
    const cookieStore = await cookies();
    const role = cookieStore.get('fm_user_role')?.value;
    if (isDashboardAdminRole(role)) {
        return null;
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function GET(request: Request) {
    const denied = await requireOffersApiAuth(request);
    if (denied) return denied;

    try {
        const offers = await prisma.offer.findMany({
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' },
            include: {
                redemptions: {
                    orderBy: { usedAt: 'desc' },
                    take: 10,
                    select: {
                        id: true,
                        buyerEmail: true,
                        buyerFullName: true,
                        usedAt: true,
                        order: {
                            select: {
                                orderNumber: true,
                            },
                        },
                    },
                },
                _count: {
                    select: {
                        redemptions: true,
                    },
                },
            },
        });
        return NextResponse.json(offers);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const denied = await requireOffersApiAuth(request);
    if (denied) return denied;

    try {
        const data = await request.json();
        const newOffer = await prisma.offer.create({
            data: {
                name: data.name,
                code: typeof data.code === 'string' ? data.code.trim().toUpperCase() : null,
                type: data.type,
                value: data.value,
                maxUses: typeof data.maxUses === 'number' && data.maxUses > 0 ? data.maxUses : null,
                startsAt: data.startsAt ? new Date(data.startsAt) : null,
                endsAt: data.endsAt ? new Date(data.endsAt) : null,
                isActive: data.isActive !== undefined ? data.isActive : true,
                rulesJson: data.rulesJson || null,
            },
        });
        return NextResponse.json(newOffer, { status: 201 });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
