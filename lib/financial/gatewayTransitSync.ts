/**
 * Completa il **transito vendite Stripe** (unico).
 * Quattro gambe + rimborsi, ancorate all’id evento sorgente (idempotenti via sourceKey).
 *
 * PayPal non è gateway di vendita: non scrivere inbound ricavi su PAYPAL_TX.
 * Incassi fuori gateway (`MANUAL_INBOUND`) restano fuori da questo sync.
 *
 * Non tocca i corrispettivi (ricavi fiscali restano sul perimetro gateway/ordine).
 */

import prisma from '@/lib/prisma';
import type { LedgerEntryInput } from '@/lib/financial/historicalLedgerTypes';
import { appendLedgerEntries } from '@/lib/financial/historicalLedgerSync';
import {
    LEDGER_COMMISSIONI_INCASSI,
    LEDGER_FINECO_ACCOUNT,
    LEDGER_PAYPAL_ACCOUNT,
    LEDGER_STRIPE_ACCOUNT,
} from '@/lib/financial/companyBankDetails';
import { ACCOUNT_RICAVI_VENDITE } from '@/lib/financial/chartOfAccounts';

const REVENUE = ACCOUNT_RICAVI_VENDITE;

export function normalizeGatewayEventToken(raw: string): string {
    return raw
        .trim()
        .replace(/^stripe_(?:com|eu)_tx_/i, '')
        .replace(/^stripe_tx_/i, '')
        .replace(/^TX:/i, '');
}

function stripeTxSourceKey(stripeId: string): string {
    return `STRIPE_TX:${stripeId}`.slice(0, 180);
}

function stripePayoutSourceKey(stripeId: string): string {
    return `STRIPE_PAYOUT:${stripeId}`.slice(0, 180);
}

function stripeRefundSourceKey(stripeId: string): string {
    return `STRIPE_REFUND:${stripeId}`.slice(0, 180);
}

/**
 * Costruisce le scritture di transito da StripeFinanceMovement (sola costruzione).
 * Dedup canale: stesso token normalizzato → una sola STRIPE_TX (preferisce riga con orderId).
 */
export async function buildStripeTransitCandidates(opts?: {
    from?: Date;
    to?: Date;
}): Promise<LedgerEntryInput[]> {
    const where: {
        createdAtStripe?: { gte?: Date; lte?: Date };
    } = {};
    if (opts?.from || opts?.to) {
        where.createdAtStripe = {};
        if (opts.from) where.createdAtStripe.gte = opts.from;
        if (opts.to) where.createdAtStripe.lte = opts.to;
    }

    const moves = await prisma.stripeFinanceMovement.findMany({
        where,
        select: {
            stripeId: true,
            type: true,
            reportingCategory: true,
            amountCents: true,
            feeCents: true,
            netCents: true,
            createdAtStripe: true,
            description: true,
            orderId: true,
            payoutId: true,
            metadataJson: true,
        },
        orderBy: { createdAtStripe: 'asc' },
        take: 20000,
    });

    const candidates: LedgerEntryInput[] = [];

    // Dedup payment/charge by normalized token
    const bestCharge = new Map<
        string,
        (typeof moves)[number]
    >();
    for (const m of moves) {
        const typ = (m.type || '').toLowerCase();
        if (typ !== 'charge' && typ !== 'payment') continue;
        if (m.amountCents <= 0) continue;
        if (/fee|payout|transfer|adjustment/i.test(m.reportingCategory || '')) continue;
        const tok = normalizeGatewayEventToken(m.stripeId);
        if (tok.length < 6) continue;
        const prev = bestCharge.get(tok);
        if (!prev) {
            bestCharge.set(tok, m);
            continue;
        }
        // Prefer linked order; then prefer .com / non-eu prefix stability (longer stripeId scoped)
        if (!prev.orderId && m.orderId) bestCharge.set(tok, m);
    }

    for (const m of bestCharge.values()) {
        candidates.push({
            sourceKey: stripeTxSourceKey(m.stripeId),
            sourceType: 'STRIPE_MOVEMENT',
            sourceId: m.stripeId.slice(0, 128),
            direction: 'ENTRATA',
            category: 'RICAVI_VENDITE',
            accountingDate: m.createdAtStripe,
            description: `Incasso Stripe ${m.type} — ${m.description || m.stripeId}`,
            counterpartyName: 'Stripe',
            netCents: m.amountCents,
            vatRate: 0,
            vatCents: 0,
            totalCents: m.amountCents,
            reconciliationStatus: m.orderId ? 'MATCHED' : 'UNMATCHED',
            documentRef: m.stripeId,
            orderId: m.orderId,
            entryNature: 'TRANSITO',
            settlementStatus: 'NOT_APPLICABLE',
            metadataJson: {
                type: m.type,
                stripeTransactionId: m.stripeId,
                feeCents: m.feeCents,
                netCents: m.netCents,
                dareAccount: LEDGER_STRIPE_ACCOUNT,
                avereAccount: REVENUE,
                transitLeg: 'customer_payment',
                token: normalizeGatewayEventToken(m.stripeId),
            },
        });
    }

    // Payouts → Fineco (uscita dal wallet). Solo id `po_*` (mai txn_* speculari).
    const bestPayout = new Map<string, (typeof moves)[number]>();
    for (const m of moves) {
        const typ = (m.type || '').toLowerCase();
        const cat = (m.reportingCategory || '').toLowerCase();
        if (typ !== 'payout' && cat !== 'payout') continue;
        const raw = m.stripeId || '';
        const po =
            (m.payoutId && m.payoutId.startsWith('po_') && m.payoutId) ||
            (raw.includes('po_') ? raw.replace(/^stripe_(?:com|eu)_tx_/i, '').replace(/^stripe_tx_/i, '') : null);
        // Speculare API: balance_transaction txn_* del payout — non scrivere
        if (!po || /txn_/i.test(po)) continue;
        const prev = bestPayout.get(po);
        if (!prev) bestPayout.set(po, m);
    }
    for (const [po, m] of bestPayout) {
        const abs = Math.abs(m.amountCents);
        if (abs <= 0) continue;
        candidates.push({
            sourceKey: stripePayoutSourceKey(po),
            sourceType: 'STRIPE_MOVEMENT',
            sourceId: po.slice(0, 128),
            direction: 'USCITA',
            category: 'TRASFERIMENTO_INTERNO',
            accountingDate: m.createdAtStripe,
            description: `Payout Stripe → Fineco — ${m.description || po}`,
            counterpartyName: 'FinecoBank',
            netCents: -abs,
            vatRate: 0,
            vatCents: 0,
            totalCents: -abs,
            reconciliationStatus: 'MATCHED',
            documentRef: po,
            orderId: m.orderId,
            entryNature: 'TRANSITO',
            settlementStatus: 'MATCHED',
            metadataJson: {
                type: 'payout',
                stripeTransactionId: m.stripeId,
                payoutId: po,
                dareAccount: LEDGER_FINECO_ACCOUNT,
                avereAccount: LEDGER_STRIPE_ACCOUNT,
                transitLeg: 'payout_to_bank',
            },
        });
    }

    // Refunds
    for (const m of moves) {
        const typ = (m.type || '').toLowerCase();
        if (typ !== 'refund' && (m.reportingCategory || '').toLowerCase() !== 'refund') continue;
        const abs = Math.abs(m.amountCents);
        if (abs <= 0) continue;
        candidates.push({
            sourceKey: stripeRefundSourceKey(m.stripeId),
            sourceType: 'STRIPE_MOVEMENT',
            sourceId: m.stripeId.slice(0, 128),
            direction: 'USCITA',
            category: 'RIMBORSI',
            accountingDate: m.createdAtStripe,
            description: `Rimborso Stripe — ${m.description || m.stripeId}`,
            counterpartyName: 'Stripe',
            netCents: -abs,
            vatRate: 0,
            vatCents: 0,
            totalCents: -abs,
            reconciliationStatus: m.orderId ? 'MATCHED' : 'UNMATCHED',
            documentRef: m.stripeId,
            orderId: m.orderId,
            entryNature: 'TRANSITO',
            settlementStatus: 'NOT_APPLICABLE',
            metadataJson: {
                type: 'refund',
                stripeTransactionId: m.stripeId,
                dareAccount: REVENUE,
                avereAccount: LEDGER_STRIPE_ACCOUNT,
                transitLeg: 'refund',
            },
        });
    }

    // Fees already posted as STRIPE_FEE:* in historicalLedgerSync — ensure metadata present
    // (no duplicate insert here; syncHistorical already emits them)

    return candidates;
}

/**
 * Garantisce dare/avere PayPal TX/FEE/PAYOUT/REFUND (backfill metadata se manca).
 * Non crea doppioni: solo insert di chiavi mancanti non è qui; il sanitize gestisce correzioni.
 * Qui: nessun rewrite — PayPal CSV già scrive le gambe. Esponiamo solo audit helper.
 */
export async function countPaypalTransitInbound(): Promise<{
    withDare: number;
    withoutDare: number;
}> {
    const rows = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceType: 'PAYPAL_MOVEMENT',
            sourceKey: { startsWith: 'PAYPAL_TX:' },
            category: 'RICAVI_VENDITE',
        },
        select: { metadataJson: true },
        take: 20000,
    });
    let withDare = 0;
    let withoutDare = 0;
    for (const r of rows) {
        const dare = String(((r.metadataJson || {}) as Record<string, unknown>).dareAccount || '');
        if (dare.includes('10200') || /PayPal/i.test(dare)) withDare++;
        else withoutDare++;
    }
    return { withDare, withoutDare };
}

/**
 * Esegue sync gambe Stripe (TX / PAYOUT / REFUND) via cancello idempotente.
 * Le fee restano su `syncHistoricalLedgerFromSources` (STRIPE_FEE).
 */
export async function syncGatewayTransitLegs(opts?: {
    from?: Date;
    to?: Date;
    dryRun?: boolean;
}): Promise<{ inserted: number; skipped: number; candidates: number }> {
    const candidates = await buildStripeTransitCandidates(opts);
    if (opts?.dryRun) {
        const { commitLedgerEntries } = await import('@/lib/financial/ledgerWriteGate');
        const r = await commitLedgerEntries(candidates, { dryRun: true });
        return {
            inserted: r.wouldInsert?.length || 0,
            skipped: r.skipped,
            candidates: candidates.length,
        };
    }
    const r = await appendLedgerEntries(candidates);
    return { inserted: r.inserted, skipped: r.skipped, candidates: candidates.length };
}

/** Copertura inbound: STRIPE_TX e/o MANUAL_INBOUND (fuori gateway). PayPal TX non conta. */
export async function measureInboundTransitCoverage(year: number): Promise<{
    gatewayLinkedOrders: number;
    withInboundLeg: number;
    missingOrderIds: string[];
    missingOrderNumbers: Array<string | null>;
    stripeTransitBalanceCents: number;
    paypalTransitBalanceCents: number;
}> {
    const { measureRevenuePerimeterSets } = await import(
        '@/lib/financial/revenuePerimeterChannels'
    );
    const {
        sumStripeSalesTransitCents,
        sumPaypalPaymentAccountCents,
    } = await import('@/lib/financial/gatewayTransitBalance');
    const sets = await measureRevenuePerimeterSets(year);
    const corr = sets.find((s) => s.id === 'corrispettivi');
    const orderIds = corr?.orderIds || [];

    const legs = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            orderId: { in: orderIds.length ? orderIds : ['__none__'] },
            OR: [
                { sourceKey: { startsWith: 'STRIPE_TX:' } },
                { sourceKey: { startsWith: 'MANUAL_INBOUND:' } },
                { sourceType: 'ORDER' },
            ],
        },
        select: { orderId: true, sourceKey: true, sourceType: true, metadataJson: true },
        take: 20000,
    });

    const withLeg = new Set<string>();
    for (const r of legs) {
        if (!r.orderId) continue;
        const meta = (r.metadataJson || {}) as Record<string, unknown>;
        const dare = String(meta.dareAccount || '');
        if (
            r.sourceKey.startsWith('STRIPE_TX:') ||
            r.sourceKey.startsWith('MANUAL_INBOUND:') ||
            (r.sourceType === 'ORDER' && /10300|10400|Stripe|fuori gateway/i.test(dare))
        ) {
            withLeg.add(r.orderId);
        }
    }

    // STRIPE_TX può mancare di orderId ma matchare Order.stripeTransactionId
    const orders = await prisma.order.findMany({
        where: { id: { in: orderIds } },
        select: { id: true, orderNumber: true, stripeTransactionId: true },
    });
    const byTx = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceKey: { startsWith: 'STRIPE_TX:' },
        },
        select: { sourceKey: true, sourceId: true },
        take: 20000,
    });
    for (const o of orders) {
        if (withLeg.has(o.id) || !o.stripeTransactionId?.trim()) continue;
        const tok = normalizeGatewayEventToken(o.stripeTransactionId);
        const hit = byTx.some((r) => {
            const id = r.sourceId || r.sourceKey.split(':').slice(1).join(':');
            const rTok = normalizeGatewayEventToken(id);
            return (
                rTok === tok ||
                id.includes(tok) ||
                r.sourceKey.includes(tok) ||
                r.sourceKey.includes(o.stripeTransactionId!)
            );
        });
        if (hit) withLeg.add(o.id);
    }

    const missing = orders.filter((o) => !withLeg.has(o.id));
    const stripeBal = await sumStripeSalesTransitCents();
    const paypalBal = await sumPaypalPaymentAccountCents();

    return {
        gatewayLinkedOrders: orderIds.length,
        withInboundLeg: withLeg.size,
        missingOrderIds: missing.map((m) => m.id),
        missingOrderNumbers: missing.map((m) => m.orderNumber),
        stripeTransitBalanceCents: stripeBal,
        paypalTransitBalanceCents: paypalBal,
    };
}
