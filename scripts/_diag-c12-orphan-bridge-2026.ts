/**
 * Diagnosi sola lettura: C12 copertura, 30 ordini senza corrispettivi, match vs gateway orfani.
 * Nessuna scrittura DB.
 *
 *   npx tsx scripts/_diag-c12-orphan-bridge-2026.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();
if (process.env.DATABASE_URL_UNPOOLED) {
    process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
}

import prisma from '@/lib/prisma';
import { isPrepaidSubscriptionPoseOrder } from '@/lib/financial/prepaidSubscriptionOrders';
import { buildGatewayCorrispettivi } from '@/lib/financial/dossierCorrispettiviBuild';
import {
    measureRevenuePerimeterSets,
    diffPerimeterSets,
} from '@/lib/financial/revenuePerimeterChannels';
import { findOrderPaymentDateDivergences } from '@/lib/financial/orderPaymentDateControl';
import { writeFileSync } from 'fs';
import { join } from 'path';

const YEAR = 2026;
const MS_DAY = 24 * 60 * 60 * 1000;

function normName(s: string): string {
    return s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim();
}

/** Checkout · NOME · …  oppure  Pagamento Express Checkout · NOME · … */
function extractPaypalCheckoutName(desc: string | null | undefined): string | null {
    if (!desc) return null;
    const m = desc.match(
        /(?:Pagamento\s+Express\s+)?Checkout\s*[·•\-]\s*(.+?)(?:\s*[·•\-]\s*(?:Ordine|Acquisto).*)?$/i
    );
    if (m?.[1]) return m[1].trim();
    return null;
}

function namesMatch(a: string, b: string): boolean {
    const na = normName(a);
    const nb = normName(b);
    if (!na || !nb || na.length < 3 || nb.length < 3) return false;
    if (na === nb) return true;
    if (na.includes(nb) || nb.includes(na)) return true;
    const ta = na.split(' ').filter((t) => t.length >= 3);
    const tb = new Set(nb.split(' ').filter((t) => t.length >= 3));
    if (ta.length === 0 || tb.size === 0) return false;
    const hits = ta.filter((t) => tb.has(t)).length;
    return hits >= Math.min(2, ta.length, tb.size);
}

type Cat = 'A' | 'B' | 'C';

async function main() {
    const start = new Date(Date.UTC(YEAR, 0, 1));
    const end = new Date(Date.UTC(YEAR, 11, 31, 23, 59, 59, 999));

    // --- C11 sets ---
    const channels = await measureRevenuePerimeterSets(YEAR);
    const byId = Object.fromEntries(channels.map((c) => [c.id, new Set(c.orderIds)]));
    const trio = byId.taxRegister!;
    const corr = byId.corrispettivi!;
    const onlyTrio = [...trio].filter((id) => !corr.has(id));

    // --- Gateway corrispettivi anno (per orfani e per copertura C12) ---
    const gw = await buildGatewayCorrispettivi({ start, end });
    const gwWithOrder = gw.rows.filter((r) => r.orderId);
    const gwNoOrder = gw.rows.filter((r) => !r.orderId);
    const corrOrderIdsFromGw = new Set(gwWithOrder.map((r) => r.orderId!));

    // --- C12 attuale ---
    const c12 = await findOrderPaymentDateDivergences(YEAR);

    // Ordini nei corrispettivi (44) vs C12 checked
    const corrOrders = await prisma.order.findMany({
        where: { id: { in: [...corr] } },
        select: {
            id: true,
            orderNumber: true,
            createdAt: true,
            stripeTransactionId: true,
            paymentMethodLabel: true,
            buyerFullName: true,
            buyerEmail: true,
            totalPriceCents: true,
            additionalInstructions: true,
            financeNotes: true,
            isRecurring: true,
            grossAmount: true,
            netAmount: true,
            stripeFee: true,
        },
    });

    // Criterio C12 OLD: stripeTransactionId OR paymentMethodLabel, poi serve movimento risolto
    const c12CandidatePool = corrOrders.filter(
        (o) => Boolean(o.stripeTransactionId?.trim()) || Boolean(o.paymentMethodLabel?.trim())
    );
    const c12ExcludedFromPool = corrOrders.filter(
        (o) => !o.stripeTransactionId?.trim() && !o.paymentMethodLabel?.trim()
    );

    // Perché checked=22: movimenti risolti solo per subset
    const linkedStripe = await prisma.stripeFinanceMovement.findMany({
        where: {
            OR: [
                { orderId: { in: [...corr] } },
                {
                    stripeId: {
                        in: corrOrders
                            .map((o) => o.stripeTransactionId)
                            .filter((t): t is string => Boolean(t?.trim())),
                    },
                },
            ],
            type: { in: ['charge', 'payment'] },
        },
        select: { orderId: true, stripeId: true, createdAtStripe: true },
    });
    const paypalLinked = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            orderId: { in: [...corr] },
            OR: [
                { sourceType: 'PAYPAL_MOVEMENT' },
                { sourceKey: { startsWith: 'PAYPAL_' } },
            ],
        },
        select: { orderId: true, accountingDate: true, description: true, totalCents: true },
    });

    const resolvablePay = new Set<string>();
    for (const m of linkedStripe) {
        const oid =
            m.orderId ||
            corrOrders.find((o) => o.stripeTransactionId === m.stripeId)?.id;
        if (oid) resolvablePay.add(oid);
    }
    for (const p of paypalLinked) {
        if (p.orderId) resolvablePay.add(p.orderId);
    }

    const inCorrNotChecked = corrOrders
        .filter((o) => !resolvablePay.has(o.id))
        .map((o) => ({
            orderNumber: o.orderNumber,
            reason: !o.stripeTransactionId?.trim() && !o.paymentMethodLabel?.trim()
                ? 'C12_prefilter: niente stripeTransactionId né paymentMethodLabel'
                : 'C12_resolve: in pool ma nessun movimento Stripe/PayPal risolto per data',
            stripeTransactionId: o.stripeTransactionId,
            paymentMethodLabel: o.paymentMethodLabel,
            howInCorrispettivi: corrOrderIdsFromGw.has(o.id)
                ? 'gw_row.orderId'
                : o.stripeTransactionId
                  ? 'order.stripeTransactionId (membership C11)'
                  : 'other',
        }));

    // --- Classifica i 30 ---
    const thirty = await prisma.order.findMany({
        where: { id: { in: onlyTrio } },
        select: {
            id: true,
            orderNumber: true,
            createdAt: true,
            buyerFullName: true,
            buyerEmail: true,
            totalPriceCents: true,
            grossAmount: true,
            additionalInstructions: true,
            financeNotes: true,
            paymentMethodLabel: true,
            stripeTransactionId: true,
            status: true,
            isRecurring: true,
            netAmount: true,
            stripeFee: true,
        },
        orderBy: { createdAt: 'asc' },
    });

    // Candidate unmatched gateway for whole year (same as gwNoOrder + enrich)
    type Orphan = {
        key: string;
        gateway: 'stripe' | 'paypal';
        date: Date;
        dateIso: string;
        amountCents: number;
        name: string | null;
        description: string | null;
        stripeId?: string;
        ledgerId?: string;
    };

    const orphans: Orphan[] = [];
    const stripeOrphans = await prisma.stripeFinanceMovement.findMany({
        where: {
            orderId: null,
            type: { in: ['charge', 'payment'] },
            createdAtStripe: { gte: start, lte: end },
            amountCents: { gt: 0 },
        },
        select: {
            id: true,
            stripeId: true,
            createdAtStripe: true,
            amountCents: true,
            description: true,
            metadataJson: true,
        },
    });
    for (const s of stripeOrphans) {
        if (!s.createdAtStripe) continue;
        orphans.push({
            key: `stripe:${s.stripeId || s.id}`,
            gateway: 'stripe',
            date: s.createdAtStripe,
            dateIso: s.createdAtStripe.toISOString().slice(0, 10),
            amountCents: s.amountCents,
            name: null,
            description: s.description,
            stripeId: s.stripeId || undefined,
        });
    }

    const paypalOrphans = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            orderId: null,
            accountingDate: { gte: start, lte: end },
            sourceType: 'PAYPAL_MOVEMENT',
            category: 'RICAVI_VENDITE',
        },
        select: {
            id: true,
            accountingDate: true,
            totalCents: true,
            description: true,
            counterpartyName: true,
            direction: true,
        },
    });

    for (const p of paypalOrphans) {
        if (p.totalCents <= 0 && p.direction === 'USCITA') continue;
        if (p.totalCents <= 0) continue;
        const fromDesc = extractPaypalCheckoutName(p.description);
        orphans.push({
            key: `paypal:${p.id}`,
            gateway: 'paypal',
            date: p.accountingDate,
            dateIso: p.accountingDate.toISOString().slice(0, 10),
            amountCents: Math.abs(p.totalCents),
            name: fromDesc || p.counterpartyName || null,
            description: p.description,
            ledgerId: p.id,
        });
    }

    // Also use gwNoOrder count for report alignment
    const classified = thirty.map((o) => {
        const blob = `${o.additionalInstructions || ''} ${o.financeNotes || ''}`;
        const orderDay = o.createdAt;
        const amount =
            o.grossAmount != null ? Math.round(o.grossAmount * 100) : o.totalPriceCents;
        const clientName = o.buyerFullName || o.buyerEmail || '';

        const candidates = orphans.filter((orp) => {
            const dayDiff = Math.abs(orp.date.getTime() - orderDay.getTime()) / MS_DAY;
            if (dayDiff > 3) return false;
            if (Math.abs(orp.amountCents - amount) > 1) return false;
            // name: if orphan has name, must match; if not, amount+date only (weaker)
            if (orp.name && clientName) return namesMatch(orp.name, clientName);
            if (orp.name && !clientName) return false;
            // no name on orphan → still candidate on date+amount (weaker; not auto-link)
            return true;
        });

        const isEu =
            /IMPORT_EU_HISTORICAL|source=floremoria\.eu|EU_HIST/i.test(blob) ||
            /stripe_eu/i.test(o.paymentMethodLabel || '') ||
            /stripe_eu_/i.test(o.stripeTransactionId || '') ||
            candidates.some((c) => /stripe_eu/i.test(c.key));
        const isManual =
            /IMPORT_MANUALE|registrazione carnet|dashboard admin/i.test(blob) && !isEu;
        const isCom = !isEu && !isManual && Boolean(o.stripeTransactionId);
        const channel = isEu ? '.eu_storico' : isManual ? 'manuale' : isCom ? '.com' : 'incerto';

        const strong = candidates.filter((c) => {
            if (!c.name || !clientName) return false;
            return namesMatch(c.name, clientName);
        });

        let category: Cat;
        let note = '';
        if (strong.length === 1 || (strong.length === 0 && candidates.length === 1 && candidates[0]!.name)) {
            // unique strong or unique with name
            category = isEu ? 'B' : 'A';
            note = `match_sim: ${strong[0]?.key || candidates[0]?.key}`;
        } else if (candidates.length === 1 && !candidates[0]!.name) {
            // unique date+amount only — still A/B candidate but weaker
            category = isEu ? 'B' : 'A';
            note = `match_sim_weak_no_name: ${candidates[0]!.key}`;
        } else if (candidates.length > 1) {
            category = isEu ? 'B' : 'A';
            note = `ambiguous_${candidates.length}_candidates`;
        } else if (
            o.status === 'CANCELLED' ||
            /test|abbandon|annull/i.test(blob) ||
            amount <= 0
        ) {
            category = 'C';
            note = 'no_gateway_candidate';
        } else {
            // no match found — could be C or A with orphan outside ±3d/amount
            // Heuristic: COMPLETED/PAID-like without any nearby orphan → still possible A (wrong amount) or C
            const nearAnyAmount = orphans.filter((orp) => {
                const dayDiff = Math.abs(orp.date.getTime() - orderDay.getTime()) / MS_DAY;
                return dayDiff <= 3 && orp.name && clientName && namesMatch(orp.name, clientName);
            });
            if (nearAnyAmount.length > 0) {
                category = isEu ? 'B' : 'A';
                note = `name_date_match_amount_mismatch:${nearAnyAmount.map((x) => (x.amountCents / 100).toFixed(2)).join(',')}`;
            } else if (isEu) {
                category = 'B';
                note = 'eu_no_orphan_match';
            } else if (!o.stripeTransactionId && isManual) {
                // manual without TX: likely A (payment elsewhere) or C
                category = 'A';
                note = 'manual_no_tx_no_orphan_match_presumed_A_pending_review';
            } else {
                category = 'C';
                note = 'no_orphan_match';
            }
        }

        return {
            orderId: o.id,
            orderNumber: o.orderNumber,
            date: o.createdAt.toISOString().slice(0, 10),
            cliente: clientName,
            email: o.buyerEmail,
            amountCents: amount,
            euro: amount / 100,
            channel,
            category,
            note,
            status: o.status,
            candidates: candidates.map((c) => ({
                key: c.key,
                gateway: c.gateway,
                date: c.dateIso,
                euro: c.amountCents / 100,
                name: c.name,
                strong: Boolean(c.name && clientName && namesMatch(c.name, clientName)),
            })),
        };
    });

    // --- Match simulation 30 × orphans (unique / ambiguous / orphan) ---
    type Edge = {
        orderId: string;
        orderNumber: string | null;
        orphanKey: string;
        score: 'strong' | 'weak';
    };
    const edges: Edge[] = [];
    for (const row of classified) {
        for (const c of row.candidates) {
            edges.push({
                orderId: row.orderId,
                orderNumber: row.orderNumber,
                orphanKey: c.key,
                score: c.strong ? 'strong' : 'weak',
            });
        }
    }

    // Unique: order has exactly 1 strong candidate AND that orphan has exactly 1 strong order
    const strongEdges = edges.filter((e) => e.score === 'strong');
    const byOrderStrong = new Map<string, Edge[]>();
    const byOrphanStrong = new Map<string, Edge[]>();
    for (const e of strongEdges) {
        byOrderStrong.set(e.orderId, [...(byOrderStrong.get(e.orderId) || []), e]);
        byOrphanStrong.set(e.orphanKey, [...(byOrphanStrong.get(e.orphanKey) || []), e]);
    }

    const unique: Edge[] = [];
    const ambiguous: Array<{ orderId: string; orderNumber: string | null; edges: Edge[] }> = [];
    const usedOrphans = new Set<string>();
    const usedOrders = new Set<string>();

    for (const [oid, list] of byOrderStrong) {
        if (list.length !== 1) {
            ambiguous.push({ orderId: oid, orderNumber: list[0]?.orderNumber || null, edges: list });
            continue;
        }
        const e = list[0]!;
        const orphanSide = byOrphanStrong.get(e.orphanKey) || [];
        if (orphanSide.length !== 1) {
            ambiguous.push({ orderId: oid, orderNumber: e.orderNumber, edges: orphanSide });
            continue;
        }
        unique.push(e);
        usedOrphans.add(e.orphanKey);
        usedOrders.add(oid);
    }

    // Also weak-only unique (date+amount, no name) → list separately as weak unique
    const weakOnlyUnique: Edge[] = [];
    for (const row of classified) {
        if (usedOrders.has(row.orderId)) continue;
        const weak = row.candidates.filter((c) => !c.strong);
        const strong = row.candidates.filter((c) => c.strong);
        if (strong.length === 0 && weak.length === 1) {
            const e: Edge = {
                orderId: row.orderId,
                orderNumber: row.orderNumber,
                orphanKey: weak[0]!.key,
                score: 'weak',
            };
            // orphan not claimed by another unique strong
            if (!usedOrphans.has(e.orphanKey)) {
                weakOnlyUnique.push(e);
            }
        } else if (row.candidates.length > 1 && !usedOrders.has(row.orderId)) {
            if (!ambiguous.some((a) => a.orderId === row.orderId)) {
                ambiguous.push({
                    orderId: row.orderId,
                    orderNumber: row.orderNumber,
                    edges: row.candidates.map((c) => ({
                        orderId: row.orderId,
                        orderNumber: row.orderNumber,
                        orphanKey: c.key,
                        score: c.strong ? 'strong' : 'weak',
                    })),
                });
            }
        }
    }

    const orphanOrders = classified.filter(
        (r) =>
            !usedOrders.has(r.orderId) &&
            !weakOnlyUnique.some((w) => w.orderId === r.orderId) &&
            !ambiguous.some((a) => a.orderId === r.orderId && a.edges.length > 0)
    );
    // refine orphan orders: no candidates at all
    const ordersOrphan = classified.filter((r) => r.candidates.length === 0);
    const orphansStill = orphans.filter(
        (o) =>
            !usedOrphans.has(o.key) &&
            !weakOnlyUnique.some((w) => w.orphanKey === o.key)
    );

    const sumCat = (cat: Cat) => {
        const rows = classified.filter((r) => r.category === cat);
        return {
            n: rows.length,
            euro: rows.reduce((s, r) => s + r.euro, 0),
            rows: rows.map((r) => ({
                orderNumber: r.orderNumber,
                date: r.date,
                cliente: r.cliente,
                euro: r.euro,
                channel: r.channel,
                note: r.note,
            })),
        };
    };

    const report = {
        generatedAt: new Date().toISOString(),
        year: YEAR,
        c12: {
            checked: c12.checked,
            divergences: c12.divergences.length,
            corrSetSize: corr.size,
            gwRowsWithOrder: gwWithOrder.length,
            exclusion: {
                criterion:
                    'C12 carica solo Order con stripeTransactionId OR paymentMethodLabel; poi conta solo quelli con data movimento Stripe/PayPal risolvibile. Gli ordini nei corrispettivi per soli altri criteri (es. membership via TX senza label, o solo link soft) restano fuori.',
                corrOrders: corrOrders.length,
                poolWithTxOrLabel: c12CandidatePool.length,
                excludedByPrefilter: c12ExcludedFromPool.map((o) => o.orderNumber),
                inCorrNotResolvablePayDate: inCorrNotChecked,
                resolvablePayDateCount: resolvablePay.size,
            },
        },
        perimeter: {
            trio: trio.size,
            corrispettivi: corr.size,
            onlyTrioCount: onlyTrio.length,
            gwNoOrderRows: gwNoOrder.length,
            stripeOrphans: stripeOrphans.length,
            paypalOrphans: paypalOrphans.length,
            orphansBuilt: orphans.length,
        },
        classification30: {
            A: sumCat('A'),
            B: sumCat('B'),
            C: sumCat('C'),
            all: classified,
        },
        matchSimulation: {
            uniqueStrong: {
                n: unique.length,
                euroOrders: unique.reduce((s, e) => {
                    const o = classified.find((c) => c.orderId === e.orderId);
                    return s + (o?.euro || 0);
                }, 0),
                pairs: unique.map((e) => {
                    const o = classified.find((c) => c.orderId === e.orderId);
                    const orp = orphans.find((x) => x.key === e.orphanKey);
                    return {
                        orderNumber: e.orderNumber,
                        orderEuro: o?.euro,
                        orderDate: o?.date,
                        cliente: o?.cliente,
                        orphanKey: e.orphanKey,
                        gateway: orp?.gateway,
                        orphanDate: orp?.dateIso,
                        orphanEuro: orp ? orp.amountCents / 100 : null,
                        orphanName: orp?.name,
                    };
                }),
            },
            uniqueWeakDateAmountOnly: {
                n: weakOnlyUnique.length,
                note: 'univoci su data±3 + importo ma senza nome — NON candidati forti',
                pairs: weakOnlyUnique.map((e) => {
                    const o = classified.find((c) => c.orderId === e.orderId);
                    const orp = orphans.find((x) => x.key === e.orphanKey);
                    return {
                        orderNumber: e.orderNumber,
                        orderEuro: o?.euro,
                        orphanKey: e.orphanKey,
                        orphanName: orp?.name,
                        orphanEuro: orp ? orp.amountCents / 100 : null,
                    };
                }),
            },
            ambiguous: {
                n: ambiguous.length,
                items: ambiguous.map((a) => ({
                    orderNumber: a.orderNumber,
                    candidates: a.edges.map((e) => e.orphanKey),
                })),
            },
            stillOrphanOrders: {
                n: ordersOrphan.length,
                euro: ordersOrphan.reduce((s, r) => s + r.euro, 0),
                orderNumbers: ordersOrphan.map((r) => r.orderNumber),
            },
            stillOrphanIncassi: {
                n: orphansStill.length,
                euro: orphansStill.reduce((s, o) => s + o.amountCents, 0) / 100,
                byGateway: {
                    stripe: orphansStill.filter((o) => o.gateway === 'stripe').length,
                    paypal: orphansStill.filter((o) => o.gateway === 'paypal').length,
                },
            },
        },
    };

    const outPath = join(
        process.cwd(),
        'docs/verbali/11-09-2026-diag-c12-orfani-bridge.json'
    );
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
        written: outPath,
        c12: report.c12.exclusion,
        c12checked: c12.checked,
        corr: corr.size,
        onlyTrio: onlyTrio.length,
        orphans: orphans.length,
        gwNoOrder: gwNoOrder.length,
        catA: report.classification30.A.n,
        catAeuro: report.classification30.A.euro,
        catB: report.classification30.B.n,
        catBeuro: report.classification30.B.euro,
        catC: report.classification30.C.n,
        catCeuro: report.classification30.C.euro,
        uniqueStrong: report.matchSimulation.uniqueStrong.n,
        uniqueWeak: report.matchSimulation.uniqueWeakDateAmountOnly.n,
        ambiguous: report.matchSimulation.ambiguous.n,
        orphanOrders: report.matchSimulation.stillOrphanOrders.n,
        orphanIncassi: report.matchSimulation.stillOrphanIncassi.n,
    }, null, 2));

    await prisma.$disconnect();
}

main().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
