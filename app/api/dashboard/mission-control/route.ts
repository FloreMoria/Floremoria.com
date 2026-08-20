import { NextResponse } from 'next/server';
import { getGa4HealthState } from '@/lib/ga4/status';
import { computeHistoricalPnl } from '@/lib/financial/historicalLedgerQuery';

export const dynamic = 'force-dynamic';

export async function GET() {
    const getRandState = (probGreen: number) => {
        const rand = Math.random();
        if (rand < probGreen) return 'green';
        if (rand < probGreen + 0.1) return 'yellow';
        return 'red';
    };

    let financeKpi: {
        ricaviLordiCents: number;
        ebitdaCents: number;
        risultatoAnteImposteCents: number;
        entriesCount: number;
    } | null = null;
    try {
        const pnl = await computeHistoricalPnl({ fiscalYear: new Date().getFullYear() });
        financeKpi = {
            ricaviLordiCents: pnl.ricaviLordiCents,
            ebitdaCents: pnl.ebitdaCents,
            risultatoAnteImposteCents: pnl.risultatoAnteImposteCents,
            entriesCount: pnl.entriesCount,
        };
    } catch {
        financeKpi = null;
    }

    const data = {
        ga4: await getGa4HealthState(),
        calendar: getRandState(0.95),
        ads: getRandState(0.8),
        merchant: getRandState(0.85),
        maps: getRandState(0.9),
        gmail: getRandState(0.9),
        gemini: getRandState(0.8),
        meet: getRandState(0.95),
        openreply: getRandState(0.9),
        github: getRandState(0.9),
        social: getRandState(0.9),
        financeKpi,
    };

    return NextResponse.json(data);
}
