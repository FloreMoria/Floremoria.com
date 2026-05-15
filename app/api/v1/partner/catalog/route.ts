import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticatePartnerV1, touchPartnerCredentialLastUsed } from '@/lib/partnerV1Auth';
import { partnerV1CorsHeaders } from '@/lib/partnerV1Cors';
import { mapCatalogProduct, partnerCatalogInclude } from '@/lib/partnerCatalogMap';

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
    const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit')) || 100));

    const products = await prisma.product.findMany({
        where: { isActive: true, deletedAt: null },
        include: partnerCatalogInclude,
        orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
        take: limit,
    });

    await touchPartnerCredentialLastUsed(auth.credentialId);

    return NextResponse.json(
        { data: products.map(mapCatalogProduct) },
        { headers: { ...partnerV1CorsHeaders(request, 'GET, OPTIONS'), 'Content-Type': 'application/json' } }
    );
}
