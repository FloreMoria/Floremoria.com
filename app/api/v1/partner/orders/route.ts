import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticatePartnerV1, touchPartnerCredentialLastUsed } from '@/lib/partnerV1Auth';
import { partnerV1CorsHeaders } from '@/lib/partnerV1Cors';

export const runtime = 'nodejs';

function unauthorized(request: Request) {
    return NextResponse.json(
        { error: 'Non autorizzato. Invia X-Partner-Key (public id fmp_…) e Authorization: Bearer con il segreto, oppure X-Partner-Key: publicId:secret.' },
        { status: 401, headers: { ...partnerV1CorsHeaders(request, 'GET, OPTIONS'), 'Content-Type': 'application/json' } }
    );
}

export async function OPTIONS(request: Request) {
    return new NextResponse(null, { status: 204, headers: partnerV1CorsHeaders(request, 'GET, OPTIONS') });
}

export async function GET(request: Request) {
    const auth = await authenticatePartnerV1(request);
    if (!auth) return unauthorized(request);

    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 50));
    const offset = Math.max(0, Number(searchParams.get('offset')) || 0);
    const queryAgencyId = searchParams.get('agencyId')?.trim();

    const where: any = {
        partnerId: auth.partnerId,
        deletedAt: null,
    };

    if (queryAgencyId) {
        where.agencyName = queryAgencyId;
    }

    const [total, rows] = await Promise.all([
        prisma.order.count({ where }),
        prisma.order.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset,
            select: {
                id: true,
                orderNumber: true,
                status: true,
                createdAt: true,
                agencyName: true,
                deceasedName: true,
                totalPriceCents: true,
                currency: true,
            },
        }),
    ]);

    await touchPartnerCredentialLastUsed(auth.credentialId);

    return NextResponse.json(
        {
            data: rows.map((o) => ({
                id: o.id,
                orderNumber: o.orderNumber,
                status: o.status,
                createdAt: o.createdAt.toISOString(),
                agencyName: o.agencyName,
                deceasedName: o.deceasedName,
                totalPriceCents: o.totalPriceCents,
                currency: o.currency,
            })),
            meta: { total, limit, offset },
        },
        { headers: { ...partnerV1CorsHeaders(request, 'GET, OPTIONS'), 'Content-Type': 'application/json' } }
    );
}
