import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticatePartnerV1, touchPartnerCredentialLastUsed } from '@/lib/partnerV1Auth';
import { partnerV1CorsHeaders } from '@/lib/partnerV1Cors';
import { mapCatalogProductDetail, partnerCatalogInclude } from '@/lib/partnerCatalogMap';

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

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
    const auth = await authenticatePartnerV1(request);
    if (!auth) return unauthorized(request);

    const { id } = await ctx.params;
    const product = await prisma.product.findFirst({
        where: { id, isActive: true, deletedAt: null },
        include: partnerCatalogInclude,
    });

    if (!product) {
        return NextResponse.json({ error: 'Prodotto non trovato.' }, { status: 404, headers: { ...partnerV1CorsHeaders(request, 'GET, OPTIONS') } });
    }

    await touchPartnerCredentialLastUsed(auth.credentialId);

    return NextResponse.json(
        { data: mapCatalogProductDetail(product) },
        { headers: { ...partnerV1CorsHeaders(request, 'GET, OPTIONS'), 'Content-Type': 'application/json' } }
    );
}
