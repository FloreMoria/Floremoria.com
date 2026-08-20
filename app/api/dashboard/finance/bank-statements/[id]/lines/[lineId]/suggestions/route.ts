import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import prisma from '@/lib/prisma';
import { suggestMatchesForLine } from '@/lib/financial/reconciliation';

type Ctx = { params: Promise<{ id: string; lineId: string }> };

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, ctx: Ctx) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const { id: documentId, lineId } = await ctx.params;
    try {
        const line = await prisma.bankStatementLine.findFirst({
            where: { id: lineId, documentId },
        });
        if (!line) {
            return NextResponse.json({ ok: false, error: 'Riga non trovata' }, { status: 404 });
        }

        const suggestions = await suggestMatchesForLine({
            description: line.description,
            amountCents: line.amountCents,
            accountingDate: line.accountingDate,
            valueDate: line.valueDate,
        });

        return NextResponse.json({
            ok: true,
            line: {
                id: line.id,
                description: line.description,
                amountCents: line.amountCents,
                accountingDate: line.accountingDate,
                valueDate: line.valueDate,
                matchStatus: line.matchStatus,
                matchNotes: line.matchNotes,
            },
            suggestions,
        });
    } catch (error) {
        console.error('[bank-statements suggestions]', error);
        return NextResponse.json(
            {
                ok: false,
                error: error instanceof Error ? error.message : 'Suggerimenti non disponibili',
            },
            { status: 500 }
        );
    }
}
