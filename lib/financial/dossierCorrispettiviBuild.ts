/**
 * Registro corrispettivi — METODO §8: costruito dagli **incassi gateway** (fonte §2).
 * Aliquota unica 10% su ogni vendita (§8.3 accessorietà, conferma commercialista 2026-09-20).
 * Importo: sempre lordo cliente (§8.2).
 */
import prisma from '@/lib/prisma';
import { scorporaIva, VAT_PCT_FLORAL } from '@/lib/financial/vat';
import type { DossierExceptionRow } from '@/lib/financial/dossierAcquistiBuild';
import { classifyPaypalGatewayMovement } from '@/lib/financial/paypalClassify';
import { parsePaypalSourceKey } from '@/lib/financial/paypalSourceKeys';
import {
    loadEuOrders2026Dataset,
    matchGatewaysToEuOrders,
    type EuGatewayMatch,
} from '@/lib/financial/euOrders2026Match';
import { filterGatewayIncassiForCorrispettivi } from '@/lib/financial/corrispettiviSalesFilter';
import { isStripePaypalPassthrough } from '@/lib/financial/gatewaySyncRows';

/** Retrocompat: PRESUNTA/MANCANTE non più emessi (sempre DETERMINATA al 10%). */
export type CorrispettivoVatCertainty = 'DETERMINATA' | 'PRESUNTA' | 'MANCANTE';

export type DossierCorrispettivoRow = {
    date: string;
    canaleIncasso: string;
    transactionId: string;
    orderNumber: string;
    orderId: string | null;
    grossCents: number;
    vatRate: number;
    vatCertainty: CorrispettivoVatCertainty;
    vatRuleNote: string;
    imponibileCents: number;
    ivaCents: number;
};

const EU_PRESUNTA_CUTOFF = new Date('2026-07-02T00:00:00.000Z');

function isEuChannel(blob: string, paymentDate: Date): boolean {
    if (paymentDate >= EU_PRESUNTA_CUTOFF) return false;
    return /floremoria\.eu|stripe_eu|\.eu\b|psa|san\s*marco/i.test(blob);
}

/** Canale visualizzato nel registro / export commercialista. */
export type CorrispettivoCanaleIncasso = 'Stripe' | 'PayPal' | 'PayPal (via Stripe)';

type GatewayIncasso = {
    gateway: CorrispettivoCanaleIncasso;
    transactionId: string;
    grossCents: number;
    paymentDate: Date;
    orderId: string | null;
    channelBlob: string;
    isEu: boolean;
    /** Chiavi alternative per match Order.stripeTransactionId (pi_/txn_/ch_/…). */
    linkIds: string[];
    payerName: string | null;
    email: string | null;
};

async function loadStripeIncassi(start: Date, end: Date): Promise<GatewayIncasso[]> {
    const rows = await prisma.stripeFinanceMovement.findMany({
        where: {
            createdAtStripe: { gte: start, lte: end },
            type: { in: ['charge', 'payment', 'payment_refund', 'refund'] },
        },
        select: {
            stripeId: true,
            sourceId: true,
            type: true,
            amountCents: true,
            createdAtStripe: true,
            orderId: true,
            reportingCategory: true,
            description: true,
            metadataJson: true,
        },
        take: 5000,
    });

    const out: GatewayIncasso[] = [];
    for (const r of rows) {
        const t = (r.type || '').toLowerCase();
        const isRefund = t.includes('refund');
        // amountCents Stripe: charge positivo tipico; refund negativo
        let gross = r.amountCents;
        if (!isRefund && gross < 0) gross = Math.abs(gross);
        if (isRefund && gross > 0) gross = -gross;
        if (gross === 0) continue;
        // Escludi fee-only / payout-like
        if (/fee|payout|transfer|adjustment/i.test(r.reportingCategory || '')) continue;

        const txId = (r.sourceId || r.stripeId || '').trim();
        if (!txId) continue;
        const meta = (r.metadataJson || {}) as Record<string, unknown>;
        const rawStripeId =
            typeof meta.rawStripeId === 'string'
                ? meta.rawStripeId
                : r.stripeId.replace(/^stripe_(?:com|eu)_tx_/, '').replace(/^stripe_tx_/, '');
        const blob = `${r.stripeId} ${r.sourceId || ''} ${r.description || ''} ${JSON.stringify(r.metadataJson || {})}`;
        const payerName =
            (typeof meta.customerName === 'string' && meta.customerName) ||
            (typeof meta.billing_name === 'string' && meta.billing_name) ||
            (typeof meta.payerName === 'string' && meta.payerName) ||
            null;
        const email =
            (typeof meta.receipt_email === 'string' && meta.receipt_email) ||
            (typeof meta.customerEmail === 'string' && meta.customerEmail) ||
            (typeof meta.email === 'string' && meta.email) ||
            null;
        // Checkout PayPal su rail Stripe: etichetta distinta (stesso portale PayPal per verifica)
        const canale: CorrispettivoCanaleIncasso = isStripePaypalPassthrough(meta)
            ? 'PayPal (via Stripe)'
            : 'Stripe';
        out.push({
            gateway: canale,
            transactionId: txId,
            grossCents: gross,
            paymentDate: r.createdAtStripe,
            orderId: r.orderId,
            channelBlob: blob,
            isEu:
                /stripe_eu/i.test(r.stripeId) ||
                meta.account === 'EU' ||
                isEuChannel(blob, r.createdAtStripe),
            linkIds: [...new Set([txId, r.stripeId, rawStripeId, r.sourceId || ''].filter(Boolean))],
            payerName,
            email,
        });
    }
    return out;
}

async function loadPaypalIncassi(start: Date, end: Date): Promise<GatewayIncasso[]> {
    const rows = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceKey: { startsWith: 'PAYPAL_' },
            accountingDate: { gte: start, lte: end },
        },
        select: {
            sourceKey: true,
            orderId: true,
            accountingDate: true,
            totalCents: true,
            description: true,
            metadataJson: true,
            category: true,
            direction: true,
        },
        take: 5000,
    });

    const out: GatewayIncasso[] = [];
    for (const r of rows) {
        const meta = (r.metadataJson || {}) as Record<string, unknown>;
        const classified = classifyPaypalGatewayMovement({
            description: r.description || '',
            grossCents: r.totalCents,
            feeCents: typeof meta.feeCents === 'number' ? meta.feeCents : undefined,
            eventCode: typeof meta.eventCode === 'string' ? meta.eventCode : null,
            payerEmail: typeof meta.payerEmail === 'string' ? meta.payerEmail : null,
            counterpartyName:
                typeof meta.counterpartyName === 'string' ? meta.counterpartyName : null,
        });
        if (classified.movementKind !== 'incasso' && classified.movementKind !== 'rimborso') {
            continue;
        }
        // Preferisci gross da metadata se presente (lordo), altrimenti |totalCents|
        const metaGross =
            typeof meta.grossCents === 'number'
                ? meta.grossCents
                : typeof meta.amountCents === 'number'
                  ? meta.amountCents
                  : null;
        let gross =
            metaGross != null && Number.isFinite(metaGross)
                ? Math.round(metaGross)
                : Math.abs(r.totalCents || 0);
        if (classified.movementKind === 'rimborso') gross = -Math.abs(gross);
        else if (r.direction === 'USCITA' && classified.movementKind === 'incasso') {
            continue;
        }
        if (gross === 0) continue;

        const parsed = parsePaypalSourceKey(r.sourceKey);
        const txId =
            (typeof meta.transactionId === 'string' && meta.transactionId) ||
            parsed?.transactionId ||
            r.sourceKey.replace(/^PAYPAL_/, '');
        const date = r.accountingDate || new Date();
        const blob = `${r.description || ''} ${r.sourceKey} ${JSON.stringify(meta)}`;
        out.push({
            gateway: 'PayPal',
            transactionId: txId,
            grossCents: gross,
            paymentDate: date,
            orderId: r.orderId,
            channelBlob: blob,
            isEu: isEuChannel(blob, date),
            linkIds: [...new Set([txId, parsed?.canonicalKey || '', r.sourceKey].filter(Boolean))],
            payerName:
                (typeof meta.counterpartyName === 'string' && meta.counterpartyName) ||
                (typeof meta.payerName === 'string' && meta.payerName) ||
                null,
            email:
                (typeof meta.payerEmail === 'string' && meta.payerEmail) ||
                (typeof meta.email === 'string' && meta.email) ||
                null,
        });
    }
    return out;
}

/**
 * Costruisce il registro corrispettivi del periodo a partire dagli incassi Stripe/PayPal.
 */
export async function buildGatewayCorrispettivi(params: {
    start: Date;
    end: Date;
}): Promise<{
    rows: DossierCorrispettivoRow[];
    exceptions: DossierExceptionRow[];
    totals: {
        determinataGrossCents: number;
        presuntaGrossCents: number;
        mancanteGrossCents: number;
        ivaDebitoCents: number;
        imponibileCents: number;
        grossAllCents: number;
        mancanteShare: number;
    };
}> {
    const [stripe, paypal] = await Promise.all([
        loadStripeIncassi(params.start, params.end),
        loadPaypalIncassi(params.start, params.end),
    ]);

    // Dedup per transactionId (stesso incasso visto due volte)
    const byTx = new Map<string, GatewayIncasso>();
    for (const g of [...stripe, ...paypal]) {
        const key = `${g.gateway}:${g.transactionId}`.toLowerCase();
        const prev = byTx.get(key);
        if (!prev || Math.abs(g.grossCents) > Math.abs(prev.grossCents)) {
            byTx.set(key, g);
        }
    }
    const rawIncassi = [...byTx.values()].sort(
        (a, b) => a.paymentDate.getTime() - b.paymentDate.getTime()
    );

    // METODO §8.4 — solo vendite (report PayPal / ordine / senza gemelle / senza re_ positivi)
    const filtered = filterGatewayIncassiForCorrispettivi(rawIncassi);
    const incassi = filtered.kept.sort(
        (a, b) => a.paymentDate.getTime() - b.paymentDate.getTime()
    );
    const exceptions: DossierExceptionRow[] = [...filtered.exceptions];
    if (filtered.stats.paypalExcludedNonSale || filtered.stats.stripeExcludedTwin) {
        console.info('[dossierCorrispettivi] filtro vendite', filtered.stats);
    }

    const orderIds = [...new Set(incassi.map((i) => i.orderId).filter(Boolean))] as string[];
    const orders =
        orderIds.length > 0
            ? await prisma.order.findMany({
                  where: { id: { in: orderIds }, deletedAt: null },
                  select: {
                      id: true,
                      orderNumber: true,
                      totalPriceCents: true,
                      paymentMethodLabel: true,
                      stripeTransactionId: true,
                  },
              })
            : [];
    const orderById = new Map(orders.map((o) => [o.id, o]));

    // Match secondario: Order.stripeTransactionId ∈ linkIds (pi_/txn_/ch_/…)
    const orphans = incassi.filter((i) => !i.orderId || !orderById.has(i.orderId));
    if (orphans.length > 0) {
        const txIds = [
            ...new Set(orphans.flatMap((o) => (o.linkIds.length ? o.linkIds : [o.transactionId]))),
        ].filter(Boolean);
        const extra = await prisma.order.findMany({
            where: {
                deletedAt: null,
                OR: [
                    { stripeTransactionId: { in: txIds } },
                    ...orphans
                        .filter((o) => o.transactionId.length >= 8)
                        .slice(0, 50)
                        .map((o) => ({
                            orderNumber: {
                                contains: o.transactionId.slice(0, 12),
                                mode: 'insensitive' as const,
                            },
                        })),
                ],
            },
            select: {
                id: true,
                orderNumber: true,
                totalPriceCents: true,
                paymentMethodLabel: true,
                stripeTransactionId: true,
            },
            take: 500,
        });
        for (const o of extra) {
            orderById.set(o.id, o);
            for (const g of orphans) {
                if (g.orderId) continue;
                const st = (o.stripeTransactionId || '').trim();
                if (!st) continue;
                if (g.linkIds.some((id) => id === st) || g.transactionId === st) {
                    g.orderId = o.id;
                }
            }
        }
    }

    const rows: DossierCorrispettivoRow[] = [];
    // `exceptions` già popolato dal filtro §8.4

    // Match soft verso dataset .eu: solo identificazione ordine (nessuna scrittura DB)
    let euMatchByGwKey = new Map<string, EuGatewayMatch>();
    try {
        const euDs = loadEuOrders2026Dataset();
        const probes = incassi.map((g) => {
            // Chiave stabile per match .eu: rail tecnico (Stripe/PayPal), non etichetta display
            const rail = g.gateway === 'PayPal' ? 'PayPal' : 'Stripe';
            return {
                key: `${rail}:${g.transactionId}`.toLowerCase(),
                paymentDateIso: g.paymentDate.toISOString().slice(0, 10),
                grossCents: g.grossCents,
                payerName: g.payerName,
                email: g.email,
            };
        });
        const matched = matchGatewaysToEuOrders(probes, euDs.orders, 3);
        euMatchByGwKey = new Map(matched.map((m) => [m.gatewayKey, m]));
    } catch (err) {
        console.warn(
            '[dossierCorrispettivi] EU fixture match skipped:',
            err instanceof Error ? err.message : err
        );
    }

    for (const g of incassi) {
        const order = g.orderId ? orderById.get(g.orderId) : undefined;
        let orderNumber = order?.orderNumber || '';
        let orderId: string | null = order?.id ?? null;
        const date = g.paymentDate.toISOString().slice(0, 10);
        const rail = g.gateway === 'PayPal' ? 'PayPal' : 'Stripe';
        const gwKey = `${rail}:${g.transactionId}`.toLowerCase();
        const euHit = euMatchByGwKey.get(gwKey);

        // Dataset .eu: identifica ordine se ancora orfano; lordo resta gateway (§8.2)
        if (!orderId && euHit && g.grossCents > 0) {
            const o = euHit.order;
            orderNumber = orderNumber || o.id;
            if (euHit.listMinusGatewayCents !== 0) {
                exceptions.push({
                    cosa: `${o.customerName || o.email || o.id} · lista €${(o.incassatoRealeCents / 100).toFixed(2)} vs gateway €${(Math.abs(g.grossCents) / 100).toFixed(2)}`,
                    dove: 'Corrispettivi',
                    importoCents: euHit.listMinusGatewayCents,
                    perche:
                        'documento/lista .eu diverge dal gateway: vince il lordo gateway (§8.2)',
                });
            }
        }

        if (!orderId) {
            exceptions.push({
                cosa: `Incasso senza ordine univoco — ${g.gateway} ${g.transactionId}`,
                dove: 'Corrispettivi',
                importoCents: Math.abs(g.grossCents),
                perche:
                    `Incasso gateway senza collegamento ordine: scorporo al 10% comunque; in export commercialista il riferimento = id transazione ${g.transactionId}.`,
            });
        }

        const vat = scorporaIva(g.grossCents, VAT_PCT_FLORAL);
        const euNote =
            euHit && !order
                ? ` · match .eu ${euHit.score} (${euHit.order.customerName || euHit.order.email || euHit.order.id})`
                : '';
        rows.push({
            date,
            canaleIncasso: g.gateway,
            transactionId: g.transactionId,
            orderNumber,
            orderId,
            grossCents: vat.grossCents,
            vatRate: VAT_PCT_FLORAL,
            vatCertainty: 'DETERMINATA',
            vatRuleNote: `METODO §8.3 — aliquota unica 10% (accessorietà)${euNote}`,
            imponibileCents: vat.imponibileCents,
            ivaCents: vat.ivaCents,
        });
    }

    const totals = {
        determinataGrossCents: 0,
        presuntaGrossCents: 0,
        mancanteGrossCents: 0,
        ivaDebitoCents: 0,
        imponibileCents: 0,
        grossAllCents: 0,
        mancanteShare: 0,
    };
    for (const r of rows) {
        const g = Math.abs(r.grossCents);
        totals.grossAllCents += g;
        totals.determinataGrossCents += g;
        totals.imponibileCents += r.imponibileCents;
        totals.ivaDebitoCents += r.ivaCents;
    }
    // Gate 30% dismesso: con aliquota unica non esistono più righe senza aliquota
    totals.mancanteShare = 0;

    return { rows, exceptions, totals };
}

export function summarizeCorrispettiviVatCertainty(rows: DossierCorrispettivoRow[]) {
    const out = {
        determinataGrossCents: 0,
        presuntaGrossCents: 0,
        mancanteGrossCents: 0,
        ivaDebitoCents: 0,
        imponibileCents: 0,
    };
    for (const r of rows) {
        const g = Math.abs(r.grossCents);
        if (r.vatCertainty === 'MANCANTE') {
            out.mancanteGrossCents += g;
            continue;
        }
        if (r.vatCertainty === 'DETERMINATA') out.determinataGrossCents += g;
        if (r.vatCertainty === 'PRESUNTA') out.presuntaGrossCents += g;
        out.imponibileCents += r.imponibileCents;
        out.ivaDebitoCents += r.ivaCents;
    }
    return out;
}
