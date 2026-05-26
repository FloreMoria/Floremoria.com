import { NextResponse } from 'next/server';
import { fetchGa4OverviewResult } from '@/lib/ga4/fetchOverview';

export const dynamic = 'force-dynamic';

export async function GET() {
    const result = await fetchGa4OverviewResult({ cacheTtlMs: 5 * 60 * 1000 });
    return NextResponse.json(result, {
        headers: {
            'Cache-Control': 'no-store',
        },
    });
}
