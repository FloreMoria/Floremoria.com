import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import {
    listBankStatementMovements,
    listBankStatements,
} from '@/lib/financial/bankStatements/store';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const { searchParams } = new URL(request.url);
        const view = searchParams.get('view');
        const yearRaw = searchParams.get('year');

        if (view === 'movements') {
            let year: number | null = null;
            if (yearRaw && yearRaw !== 'all') {
                const y = Number(yearRaw);
                if (Number.isFinite(y) && y >= 2000 && y <= 2100) year = y;
            }
            const data = await listBankStatementMovements({ year });
            return NextResponse.json({
                ok: true,
                year: year ?? 'all',
                years: data.years,
                lines: data.lines,
                count: data.lines.length,
            });
        }

        const documents = await listBankStatements();
        return NextResponse.json({ ok: true, documents });
    } catch (error) {
        console.error('[bank-statements GET]', error);
        return NextResponse.json(
            { ok: false, error: "Impossibile caricare l'archivio rendiconti" },
            { status: 500 }
        );
    }
}
