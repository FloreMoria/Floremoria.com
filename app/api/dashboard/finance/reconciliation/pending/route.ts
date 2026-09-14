/**
 * GET /api/dashboard/finance/reconciliation/pending
 * Elenco unificato di tutte le righe estratto non abbinate (anno fiscale).
 * I suggerimenti NON vengono calcolati qui — on-demand per riga.
 */

import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import {
    listPendingReconciliation,
    listRecentManualReconciliations,
} from '@/lib/financial/manualReconciliationQueue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const { searchParams } = new URL(request.url);
        const yearRaw = Number(searchParams.get('year') || new Date().getFullYear());
        const year = Number.isFinite(yearRaw) ? yearRaw : new Date().getFullYear();
        const sortRaw = (searchParams.get('sort') || 'date').trim();
        const sort =
            sortRaw === 'amount' ||
            sortRaw === 'amount_desc' ||
            sortRaw === 'amount_asc' ||
            sortRaw === 'date_asc' ||
            sortRaw === 'date'
                ? sortRaw
                : 'date';
        const signRaw = (searchParams.get('sign') || 'all').trim();
        const sign =
            signRaw === 'in' || signRaw === 'out' || signRaw === 'all' ? signRaw : 'all';
        const limit = Math.min(
            Math.max(Number(searchParams.get('limit') || 100) || 100, 1),
            200
        );
        const includeRecent = searchParams.get('includeRecent') !== '0';

        const result = await listPendingReconciliation({
            year,
            from: searchParams.get('from'),
            to: searchParams.get('to'),
            sign,
            q: searchParams.get('q'),
            sort,
            limit,
            cursor: searchParams.get('cursor'),
        });

        const recent = includeRecent ? await listRecentManualReconciliations(20) : [];

        return NextResponse.json({
            ok: true,
            year,
            lines: result.lines,
            nextCursor: result.nextCursor,
            summary: result.summary,
            recent,
        });
    } catch (error) {
        console.error('[reconciliation/pending]', error);
        return NextResponse.json(
            {
                ok: false,
                error:
                    error instanceof Error
                        ? error.message
                        : 'Elenco riconciliazione non disponibile',
            },
            { status: 500 }
        );
    }
}
