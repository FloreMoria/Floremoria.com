/**
 * Riconciliazione read-only: movimenti estratto vs ledger / Stripe / ordini.
 * Perché: non riscrivere Prima Nota all'upload — solo evidenziare abbinamenti e gap.
 */

import prisma from '@/lib/prisma';
import { getLedger } from '@/lib/financial/ledgerStore';
import type { BankTransaction } from '@/lib/financial/types';
import type { ParsedBankMovement, StatementMatchResult } from './types';
import {
    matchManualExpenseByAmount,
    markManualExpenseReconciled,
} from '@/lib/financial/manualExpenses';

function dayMs(iso: string | null | undefined): number | null {
    if (!iso) return null;
    const t = Date.parse(iso.slice(0, 10));
    return Number.isFinite(t) ? t : null;
}

function withinDays(a: string | null, b: string | null | undefined, days: number): boolean {
    const da = dayMs(a);
    const db = dayMs(b || null);
    if (da == null || db == null) return true; // se manca data, non scartare per data
    return Math.abs(da - db) <= days * 24 * 60 * 60 * 1000;
}

function textScore(a: string, b: string): number {
    const na = a.toUpperCase();
    const nb = b.toUpperCase();
    if (!na || !nb) return 0;
    if (na.includes(nb) || nb.includes(na)) return 40;
    const tokens = nb.split(/[^A-Z0-9]+/).filter((t) => t.length > 3);
    let hits = 0;
    for (const t of tokens.slice(0, 8)) {
        if (na.includes(t)) hits += 1;
    }
    return Math.min(35, hits * 8);
}

function classifyHint(description: string, amountCents: number): string {
    const u = description.toUpperCase();
    if (u.includes('STRIPE')) return 'STRIPE_PAYOUT';
    if (u.includes('FIORIST') || /PT-[A-Z]{2}-\d{2}-\d{3,4}/i.test(u)) return 'FLORIST_TRANSFER';
    if (u.includes('F24') || u.includes('ADE ') || u.includes('AGENZIA DELLE ENTRATE') || u.includes('IMU')) {
        return 'TAX_PAYMENT';
    }
    if (
        u.includes('CURSOR') ||
        u.includes('GOOGLE') ||
        u.includes('ANTHROPIC') ||
        u.includes('META') ||
        u.includes('VERCEL') ||
        u.includes('OPENAI')
    ) {
        return 'SAAS_EXPENSE';
    }
    return amountCents >= 0 ? 'INFLOW' : 'OUTFLOW';
}

function matchAgainstLedgerTx(
    movement: ParsedBankMovement,
    tx: BankTransaction
): StatementMatchResult | null {
    if (tx.amountCents !== movement.amountCents) return null;
    if (!withinDays(movement.accountingDate || movement.valueDate, tx.emittedAt, 3)) return null;

    const desc = `${tx.reference || ''} ${tx.counterpartyName || ''}`;
    const score = 55 + textScore(movement.description, desc);
    return {
        matchStatus: score >= 70 ? 'MATCHED' : 'PARTIAL',
        matchType: tx.category || classifyHint(movement.description, movement.amountCents),
        matchScore: Math.min(100, score),
        matchedTxId: tx.id,
        matchedOrderId: null,
        matchNotes: `Abbinato a movimento ledger ${tx.id} (${tx.counterpartyName})`,
    };
}

async function matchAgainstStripe(movement: ParsedBankMovement): Promise<StatementMatchResult | null> {
    if (movement.amountCents <= 0) return null;
    const desc = movement.description.toUpperCase();
    if (!desc.includes('STRIPE') && !desc.includes('PAYOUT')) return null;

    const date = movement.accountingDate || movement.valueDate;
    const center = date ? new Date(`${date}T12:00:00.000Z`) : new Date();
    const from = new Date(center.getTime() - 5 * 24 * 60 * 60 * 1000);
    const to = new Date(center.getTime() + 2 * 24 * 60 * 60 * 1000);

    const payout = await prisma.stripeFinanceMovement.findFirst({
        where: {
            OR: [
                { type: { equals: 'payout', mode: 'insensitive' } },
                { reportingCategory: 'payout' },
            ],
            amountCents: { in: [movement.amountCents, -movement.amountCents] },
            createdAtStripe: { gte: from, lte: to },
        },
        orderBy: { createdAtStripe: 'desc' },
    });

    if (!payout) return null;
    return {
        matchStatus: 'MATCHED',
        matchType: 'STRIPE_PAYOUT',
        matchScore: 92,
        matchedTxId: payout.stripeId,
        matchedOrderId: payout.orderId,
        matchNotes: `Payout Stripe ${payout.stripeId}`,
    };
}

async function matchAgainstFloristOrOrder(
    movement: ParsedBankMovement
): Promise<StatementMatchResult | null> {
    const orderCode = movement.description.match(/PT-[A-Z]{2}-\d{2}-\d{3,4}/i)?.[0]?.toUpperCase();
    if (orderCode) {
        const order = await prisma.order.findUnique({
            where: { orderNumber: orderCode },
            select: { id: true, orderNumber: true, totalPriceCents: true, partnerPaymentStatus: true },
        });
        if (order) {
            return {
                matchStatus: 'MATCHED',
                matchType: movement.amountCents < 0 ? 'FLORIST_TRANSFER' : 'ORDER_INFLOW',
                matchScore: 95,
                matchedTxId: null,
                matchedOrderId: order.id,
                matchNotes: `Causale ordine ${order.orderNumber} (partnerPayment=${order.partnerPaymentStatus})`,
            };
        }
    }

    if (movement.amountCents >= 0) return null;

    const abs = Math.abs(movement.amountCents);
    // Compenso ~65% lordo: cerca ordine PAID con compenso ≈ importo
    const paid = await prisma.order.findMany({
        where: {
            isTest: false,
            deletedAt: null,
            partnerPaymentStatus: 'PAID',
            partnerId: { not: null },
        },
        select: {
            id: true,
            orderNumber: true,
            totalPriceCents: true,
            grossAmount: true,
            floristCompensationCents: true,
            updatedAt: true,
        },
        take: 200,
        orderBy: { updatedAt: 'desc' },
    });

    for (const o of paid) {
        const gross =
            o.floristCompensationCents != null
                ? o.floristCompensationCents
                : Math.round(
                      (o.grossAmount != null ? Math.round(o.grossAmount * 100) : o.totalPriceCents) * 0.65
                  );
        if (Math.abs(gross - abs) <= 50 && withinDays(movement.accountingDate, o.updatedAt.toISOString(), 10)) {
            return {
                matchStatus: 'MATCHED',
                matchType: 'FLORIST_TRANSFER',
                matchScore: 85,
                matchedTxId: null,
                matchedOrderId: o.id,
                matchNotes: `Possibile liquidazione fiorista ordine ${o.orderNumber}`,
            };
        }
    }
    return null;
}

export async function reconcileParsedMovement(
    movement: ParsedBankMovement
): Promise<StatementMatchResult> {
    const ledger = getLedger();
    let best: StatementMatchResult | null = null;

    for (const tx of ledger.transactions || []) {
        const hit = matchAgainstLedgerTx(movement, tx);
        if (!hit) continue;
        if (!best || hit.matchScore > best.matchScore) best = hit;
    }

    const stripeHit = await matchAgainstStripe(movement);
    if (stripeHit && (!best || stripeHit.matchScore > best.matchScore)) best = stripeHit;

    const orderHit = await matchAgainstFloristOrOrder(movement);
    if (orderHit && (!best || orderHit.matchScore > best.matchScore)) best = orderHit;

    // Spese manuali (fatture/scontrini/ricevute) — solo uscite
    if (movement.amountCents < 0) {
        const manual = await matchManualExpenseByAmount(
            Math.abs(movement.amountCents),
            movement.accountingDate || movement.valueDate,
            movement.description
        );
        if (manual) {
            const score = 88;
            if (!best || score > best.matchScore) {
                best = {
                    matchStatus: 'MATCHED',
                    matchType: 'MANUAL_EXPENSE',
                    matchScore: score,
                    matchedTxId: manual.id,
                    matchedOrderId: null,
                    matchNotes: `Abbinato a spesa manuale ${manual.vendorName}`,
                };
                await markManualExpenseReconciled(manual.id, null);
            }
        }
    }

    if (best) return best;

    const hint = classifyHint(movement.description, movement.amountCents);
    return {
        matchStatus: 'UNMATCHED',
        matchType: hint,
        matchScore: 0,
        matchedTxId: null,
        matchedOrderId: null,
        matchNotes: `Non abbinato — classificazione suggerita: ${hint}. Revisione admin / Alberto.`,
    };
}

export async function reconcileAllMovements(movements: ParsedBankMovement[]) {
    const results: StatementMatchResult[] = [];
    for (const m of movements) {
        results.push(await reconcileParsedMovement(m));
    }
    return results;
}
