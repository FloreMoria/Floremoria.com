import { NextResponse } from 'next/server';
import { getAllMunicipalities } from '@/lib/municipalities';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const countParam = searchParams.get('count');
    const count = countParam ? parseInt(countParam, 10) : 6;

    const allComuni = getAllMunicipalities();

    // Prevent passing too many
    const safeCount = Math.min(count, 50);

    // Create a deterministic but randomized array selection
    const shuffled = [...allComuni].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, safeCount);

    return NextResponse.json(selected);
}
