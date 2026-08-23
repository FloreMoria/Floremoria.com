/**
 * Abbinamento manuale riga estratto conto → ordine / spesa / categoria / nota libera.
 */

import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import prisma from '@/lib/prisma';
import { appendLedgerEntries } from '@/lib/financial/historicalLedgerSync';
import { markManualExpenseReconciled } from '@/lib/financial/manualExpenses';
import type { LedgerCategory } from '@/lib/financial/historicalLedgerTypes';

type Ctx = { params: Promise<{ id: string; lineId: string }> };

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function categoryFromMatchType(matchType: string, amountCents: number): LedgerCategory {
    if (
        matchType === 'FLORIST_TRANSFER' ||
        matchType === 'FLORIST_INVOICE' ||
        matchType === 'FLORIST_ADVANCE'
    ) {
        return 'COSTI_FIORISTI';
    }
    if (
        matchType === 'SDI_INVOICE' ||
        matchType === 'MANUAL_EXPENSE' ||
        matchType === 'FOREIGN_AUTOFATTURA'
    ) {
        return 'SPESE_OPERATIVE';
    }
    if (matchType === 'CASH_EXPENSE' || matchType === 'UNDOCUMENTED_EXPENSE') {
        return 'SPESE_OPERATIVE';
    }
    if (matchType === 'SAAS_SUBSCRIPTION') return 'SPESE_SAAS';
    if (matchType === 'INTERNAL_TRANSFER') return 'ALTRI_COSTI';
    if (
        matchType === 'STRIPE_PAYOUT' ||
        matchType === 'PAYPAL_PAYOUT' ||
        matchType === 'GATEWAY_PAYOUT'
    ) {
        return 'RICAVI_VENDITE';
    }
    if (matchType === 'PAYPAL_CASHBACK') return 'RIMBORSI';
    if (matchType === 'OTHER_REVENUE' || amountCents > 0) return 'ALTRI_RICAVI';
    if (matchType === 'BANK_FEE' || matchType === 'TAX_PAYMENT') return 'ONERI_BANCARI';
    return amountCents >= 0 ? 'ALTRI_RICAVI' : 'SPESE_OPERATIVE';
}

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
                : 'Riconciliato Manualmente da Contabilità';
        const asMatched = body.asMatched !== false;
        const expenseId =
            typeof body.expenseId === 'string' && body.expenseId.trim()
                ? body.expenseId.trim()
                : null;

        const line = await prisma.bankStatementLine.findFirst({
            where: { id: lineId, documentId },
        });
        if (!line) {
            return NextResponse.json({ ok: false, error: 'Riga non trovata' }, { status: 404 });
        }

        // Vincolo semantico: entrate non possono essere etichettate come uscite (es. Compenso fiorista)
        const { coerceBankCategoryForAmount } = await import(
            '@/lib/financial/bankCategoryOptions'
        );
        const safeMatchType = coerceBankCategoryForAmount(
            matchType,
            line.amountCents,
            line.description
        );

        if (matchedOrderId) {
            const order = await prisma.order.findUnique({
                where: { id: matchedOrderId },
                select: { id: true },
            });
            if (!order) {
                return NextResponse.json({ ok: false, error: 'Ordine non trovato' }, { status: 400 });
            }
        }

        const notes = asMatched
            ? matchNotes.startsWith('Riconciliato Manualmente')
                ? matchNotes
                : `Riconciliato Manualmente — ${matchNotes}`
            : matchNotes;

        const updated = await prisma.bankStatementLine.update({
            where: { id: lineId },
            data: {
                matchStatus: asMatched ? 'MATCHED' : 'PARTIAL',
                matchType: safeMatchType,
                matchScore: asMatched ? 100 : 60,
                matchedOrderId,
                matchedTxId: matchedTxId || expenseId,
                matchNotes: notes,
            },
        });

        if (expenseId) {
            try {
                await markManualExpenseReconciled(expenseId, lineId);
            } catch {
                /* best-effort */
            }
        }

        try {
            const cat = categoryFromMatchType(safeMatchType, line.amountCents);
            await appendLedgerEntries([
                {
                    sourceKey: `BANK_LINE_MANUAL:${line.id}`,
                    sourceType: 'BANK_LINE',
                    sourceId: line.id,
                    direction: line.amountCents >= 0 ? 'ENTRATA' : 'USCITA',
                    category: cat,
                    accountingDate: line.accountingDate || line.valueDate || new Date(),
                    valueDate: line.valueDate,
                    description: line.description,
                    netCents: line.amountCents,
                    vatCents: 0,
                    totalCents: line.amountCents,
                    reconciliationStatus: 'MATCHED',
                    documentRef: safeMatchType,
                    bankLineId: line.id,
                    orderId: matchedOrderId,
                    metadataJson: {
                        manualMatch: true,
                        matchType: safeMatchType,
                        matchNotes: notes,
                    },
                },
            ]);
        } catch (err) {
            console.warn('[bank-statements] ledger append', err);
        }

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
