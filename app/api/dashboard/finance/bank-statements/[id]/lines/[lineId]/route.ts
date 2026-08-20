/**
 * Abbinamento manuale riga estratto conto → ordine / spesa / nota libera.
 */

import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import prisma from '@/lib/prisma';

type Ctx = { params: Promise<{ id: string; lineId: string }> };

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, ctx: Ctx) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const { id: documentId, lineId } = await ctx.params;
    try {
        const body = await request.json().catch(() => ({}));
        const matchType =
            typeof body.matchType === 'string' && body.matchType.trim()
                ? body.matchType.trim().slice(0, 48)
                : 'MANUAL_MATCH';
        const matchedOrderId =
            typeof body.matchedOrderId === 'string' && body.matchedOrderId.trim()
                ? body.matchedOrderId.trim()
                : null;
        const matchedTxId =
            typeof body.matchedTxId === 'string' && body.matchedTxId.trim()
                ? body.matchedTxId.trim().slice(0, 128)
                : null;
        const matchNotes =
            typeof body.matchNotes === 'string' && body.matchNotes.trim()
                ? body.matchNotes.trim().slice(0, 500)
                : 'Abbinamento manuale da Contabilità';
        const asMatched = body.asMatched !== false;

        const line = await prisma.bankStatementLine.findFirst({
            where: { id: lineId, documentId },
        });
        if (!line) {
            return NextResponse.json({ ok: false, error: 'Riga non trovata' }, { status: 404 });
        }

        if (matchedOrderId) {
            const order = await prisma.order.findUnique({
                where: { id: matchedOrderId },
                select: { id: true },
            });
            if (!order) {
                return NextResponse.json({ ok: false, error: 'Ordine non trovato' }, { status: 400 });
            }
        }

        const updated = await prisma.bankStatementLine.update({
            where: { id: lineId },
            data: {
                matchStatus: asMatched ? 'MATCHED' : 'PARTIAL',
                matchType,
                matchScore: asMatched ? 100 : 60,
                matchedOrderId,
                matchedTxId,
                matchNotes,
            },
        });

        // Aggiorna contatori documento
        const [matchedCount, unmatchedCount] = await Promise.all([
            prisma.bankStatementLine.count({
                where: { documentId, matchStatus: 'MATCHED' },
            }),
            prisma.bankStatementLine.count({
                where: { documentId, matchStatus: { not: 'MATCHED' } },
            }),
        ]);
        await prisma.bankStatementDocument.update({
            where: { id: documentId },
            data: { matchedCount, unmatchedCount },
        });

        return NextResponse.json({ ok: true, line: updated, matchedCount, unmatchedCount });
    } catch (error) {
        console.error('[bank-statements line match]', error);
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : 'Abbinamento fallito' },
            { status: 500 }
        );
    }
}
