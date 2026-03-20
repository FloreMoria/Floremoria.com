import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    const getRandState = (probGreen: number) => {
        const rand = Math.random();
        if (rand < probGreen) return 'green';
        if (rand < probGreen + 0.1) return 'yellow';
        return 'red';
    };

    const data = {
        ga4: getRandState(0.9),
        calendar: getRandState(0.95),
        ads: getRandState(0.8),
        merchant: getRandState(0.85),
        maps: getRandState(0.9),
        gmail: getRandState(0.9),
        gemini: getRandState(0.8),
        meet: getRandState(0.95),
        openreply: getRandState(0.9),
        github: getRandState(0.9),
        ig: getRandState(0.85),
        fb: getRandState(0.85),
        tiktok: getRandState(0.8),
        yt: getRandState(0.9)
    };

    return NextResponse.json(data);
}
