import { NextResponse } from 'next/server';
import { buildPartnerV1OpenApiSpec } from '@/lib/openapi/buildPartnerV1Spec';

export const runtime = 'nodejs';

export async function GET() {
    return NextResponse.json(buildPartnerV1OpenApiSpec(), {
        headers: { 'Cache-Control': 'private, max-age=300' },
    });
}
