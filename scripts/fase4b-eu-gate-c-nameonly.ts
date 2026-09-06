/**
 * Read-only gate: C name-only catalog + deceased match + misure A/B + post L3.
 * Uso: npx tsx scripts/fase4b-eu-gate-c-nameonly.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { writeFileSync } from 'fs';
import { join } from 'path';
import prisma from '../lib/prisma';
import { computeHistoricalPnl } from '../lib/financial/historicalLedgerQuery';
import { applyFiscalAuthorityHierarchy } from '../lib/financial/fiscalAuthorityDedupe';

function euro(c: number) {
    return (c / 100).toLocaleString('it-IT', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
    });
}

function normName(s: string): string {
    return s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[''`´]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function nameTokens(s: string): string[] {
    return normName(s)
        .split(' ')
        .filter((t) => t.length > 1);
}

function nameScore(a: string, b: string): number {
    if (!a || !b) return 0;
    if (/senza nome/i.test(a) || /senza nome/i.test(b)) return 0;
    const na = normName(a);
    const nb = normName(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;
    const ta = nameTokens(a).sort().join(' ');
    const tb = nameTokens(b).sort().join(' ');
    if (ta && ta === tb) return 0.99;
    const setA = new Set(nameTokens(a));
    const setB = new Set(nameTokens(b));
    if (setA.size === 0 || setB.size === 0) return 0;
    let inter = 0;
    for (const t of setA) if (setB.has(t)) inter++;
    const union = new Set([...setA, ...setB]).size;
    const jaccard = inter / union;
    if (inter >= 2 && jaccard >= 0.45) return Math.max(jaccard, 0.85);
    // cognome significativo (token lungo) presente
    const longA = [...setA].filter((t) => t.length >= 4);
    const longHit = longA.filter((t) => setB.has(t));
    if (longHit.length >= 1 && jaccard >= 0.3) return Math.max(jaccard, 0.75);
    if (na.includes(nb) || nb.includes(na)) return Math.max(jaccard, 0.8);
    return jaccard;
}

const GROUP_C = `
2026-06-16;Rosetta Paladino;49.46
2026-06-05;cyrille magali Maman-Sernaglia;89.99
2026-05-25;Petra Manakova;84.98
2026-05-16;Maria Puliafico;49.99
2026-05-03;Maria ANTONIA Pozzi;53.48
2026-05-03;Isabella Cesaroni;299.90
2026-04-29;Rosetta Paladino;45.97
2026-04-28;Silvia Tregnaghi;54.98
2026-04-27;Famiglia Deotti-Buzzi;39.99
2026-04-20;LUCIANO MAMMI';59.98
2026-04-20;Elena Lombardi;39.99
2026-04-16;Rosaria Di Pasquale;29.99
2026-04-01;Cristiano Mariani;29.99
2026-03-31;FRANCESCO REDIVO;144.98
2026-03-29;Agostino Buttignol;29.99
2026-03-24;LUCIANO MAMMI';29.99
2026-03-22;LUCIANO MAMMI';29.99
2026-03-19;Silvia Tregnaghi;34.99
2026-03-18;L'alternativa srl;39.99
2026-03-14;Chiara Durì;72.48
2026-03-14;Rosetta Paladino;69.98
2026-03-13;Maria Puliafico;49.99
2026-03-01;Mimma Congedo;144.98
2026-02-26;Norm Marchi;39.99
2026-02-25;Moreno Venturino;29.99
2026-02-22;LUCIANO MAMMI';29.99
2026-02-19;Luigina Dereani;39.99
2026-02-16;LUCIANO MAMMI';29.99
2026-02-10;Ester Irace;39.99
2026-01-22;Luciano Mammì;29.99
2026-01-22;Rosetta Paladino;40.97
2026-01-21;Luciano Mammì;29.99
2026-01-16;Giulia Grappone;39.99
`
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
        const [date, customer, amount] = line.split(';');
        return {
            date: date!.trim(),
            customer: customer!.trim(),
            cents: Math.round(parseFloat(amount!) * 100),
        };
    });

const ALL_EU = `
2026-08-21;Oreste Poverello;89.99
2026-08-17;Amanda Favot;109.98
2026-08-10;Edy, Lori and Dana Moras;69.99
2026-08-06;Daniela Barilari;39.99
2026-08-01;valentina cecchini;29.99
2026-07-16;Filomena Maiorano;37.99
2026-07-09;Giulio Rosace;39.99
2026-07-03;(senza nome);69.99
2026-07-02;Nicolato Francesco;104.98
2026-06-16;Rosetta Paladino;49.46
2026-06-05;cyrille magali Maman-Sernaglia;89.99
2026-05-25;Petra Manakova;84.98
2026-05-16;Maria Puliafico;49.99
2026-05-03;Maria ANTONIA Pozzi;53.48
2026-05-03;Isabella Cesaroni;299.90
2026-04-29;Rosetta Paladino;45.97
2026-04-28;Silvia Tregnaghi;54.98
2026-04-27;Famiglia Deotti-Buzzi;39.99
2026-04-20;LUCIANO MAMMI';59.98
2026-04-20;Elena Lombardi;39.99
2026-04-16;Rosaria Di Pasquale;29.99
2026-04-01;Cristiano Mariani;29.99
2026-03-31;FRANCESCO REDIVO;144.98
2026-03-29;Agostino Buttignol;29.99
2026-03-24;LUCIANO MAMMI';29.99
2026-03-22;LUCIANO MAMMI';29.99
2026-03-19;Silvia Tregnaghi;34.99
2026-03-18;L'alternativa srl;39.99
2026-03-14;Chiara Durì;72.48
2026-03-14;Rosetta Paladino;69.98
2026-03-13;Maria Puliafico;49.99
2026-03-01;Mimma Congedo;144.98
2026-02-26;Norm Marchi;39.99
2026-02-25;Moreno Venturino;29.99
2026-02-22;LUCIANO MAMMI';29.99
2026-02-19;Luigina Dereani;39.99
2026-02-16;LUCIANO MAMMI';29.99
2026-02-10;Ester Irace;39.99
2026-01-22;Luciano Mammì;29.99
2026-01-22;Rosetta Paladino;40.97
2026-01-21;Luciano Mammì;29.99
2026-01-20;(senza nome);39.99
2026-01-16;Giulia Grappone;39.99
`
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
        const [date, customer, amount] = line.split(';');
        return {
            date: date!.trim(),
            customer: customer!.trim(),
            cents: Math.round(parseFloat(amount!) * 100),
            nameless: /^\(senza nome\)$/i.test(customer!.trim()),
        };
    });

async function main() {
    const orders = await prisma.order.findMany({
        where: { deletedAt: null },
        select: {
            id: true,
            orderNumber: true,
            status: true,
            partnerPaymentStatus: true,
            buyerFullName: true,
            buyerEmail: true,
            deceasedName: true,
            ticketMessage: true,
            additionalInstructions: true,
            agencyName: true,
            totalPriceCents: true,
            createdAt: true,
            deliveryDate: true,
            isTest: true,
        },
    });

    // Unique customers in C (for catalog) — keep all 33 rows but catalog by unique name
    const uniqueNames = [...new Set(GROUP_C.map((r) => r.customer))].sort((a, b) =>
        a.localeCompare(b, 'it')
    );

    const catalogByCustomer: Record<
        string,
        {
            listRows: typeof GROUP_C;
            buyerMatches: Array<{
                orderNumber: string | null;
                date: string;
                deliveryDate: string | null;
                cents: number;
                status: string;
                pay: string;
                buyer: string | null;
                deceased: string;
                score: number;
            }>;
            deceasedMatches: Array<{
                orderNumber: string | null;
                date: string;
                deliveryDate: string | null;
                cents: number;
                status: string;
                pay: string;
                buyer: string | null;
                deceased: string;
                score: number;
                via: 'deceasedName' | 'ticketMessage' | 'additionalInstructions' | 'agencyName';
            }>;
        }
    > = {};

    for (const name of uniqueNames) {
        const listRows = GROUP_C.filter((r) => r.customer === name);
        const buyerMatches = orders
            .map((o) => ({ o, score: nameScore(name, o.buyerFullName || '') }))
            .filter((x) => x.score >= 0.75)
            .sort((a, b) => a.o.createdAt.getTime() - b.o.createdAt.getTime())
            .map((x) => ({
                orderNumber: x.o.orderNumber,
                date: x.o.createdAt.toISOString().slice(0, 10),
                deliveryDate: x.o.deliveryDate?.toISOString().slice(0, 10) ?? null,
                cents: x.o.totalPriceCents,
                status: x.o.status,
                pay: x.o.partnerPaymentStatus,
                buyer: x.o.buyerFullName,
                deceased: x.o.deceasedName,
                score: x.score,
            }));

        const deceasedMatches: (typeof catalogByCustomer)[string]['deceasedMatches'] = [];
        for (const o of orders) {
            const checks: Array<{
                via: 'deceasedName' | 'ticketMessage' | 'additionalInstructions' | 'agencyName';
                text: string;
            }> = [
                { via: 'deceasedName', text: o.deceasedName || '' },
                { via: 'ticketMessage', text: o.ticketMessage || '' },
                { via: 'additionalInstructions', text: o.additionalInstructions || '' },
                { via: 'agencyName', text: o.agencyName || '' },
            ];
            let best: { via: (typeof checks)[0]['via']; score: number } | null = null;
            for (const c of checks) {
                // For ticket/instructions, also try significant tokens of list name
                const score = nameScore(name, c.text);
                // Famiglia X / multi-name: token overlap on deceased
                const tokens = nameTokens(name).filter((t) => t.length >= 4 && !['famiglia', 'family', 'and'].includes(t));
                let tokenHit = 0;
                const nt = normName(c.text);
                for (const t of tokens) if (nt.includes(t)) tokenHit++;
                const tokScore = tokens.length ? tokenHit / tokens.length : 0;
                const s = Math.max(score, tokScore >= 0.5 ? 0.8 : tokScore >= 1 ? 0.95 : 0);
                if (s >= 0.75 && (!best || s > best.score)) best = { via: c.via, score: s };
            }
            if (best) {
                deceasedMatches.push({
                    orderNumber: o.orderNumber,
                    date: o.createdAt.toISOString().slice(0, 10),
                    deliveryDate: o.deliveryDate?.toISOString().slice(0, 10) ?? null,
                    cents: o.totalPriceCents,
                    status: o.status,
                    pay: o.partnerPaymentStatus,
                    buyer: o.buyerFullName,
                    deceased: o.deceasedName,
                    score: best.score,
                    via: best.via,
                });
            }
        }
        deceasedMatches.sort((a, b) => a.date.localeCompare(b.date));

        catalogByCustomer[name] = { listRows, buyerMatches, deceasedMatches };
    }

    // Per ciascuna delle 33: ha riscontro destinatario (deceased/ticket/…)?
    const c33DestHits = GROUP_C.map((row) => {
        const cat = catalogByCustomer[row.customer]!;
        const destHit = cat.deceasedMatches.length > 0;
        const buyerHit = cat.buyerMatches.length > 0;
        return {
            ...row,
            list: euro(row.cents),
            buyerHit,
            buyerOrderN: cat.buyerMatches.length,
            destHit,
            destOrderN: cat.deceasedMatches.length,
            destSample: cat.deceasedMatches.slice(0, 3).map((d) => ({
                orderNumber: d.orderNumber,
                via: d.via,
                deceased: d.deceased,
                buyer: d.buyer,
                date: d.date,
                cents: euro(d.cents),
            })),
        };
    });
    const n33WithBuyer = c33DestHits.filter((r) => r.buyerHit).length;
    const n33WithDest = c33DestHits.filter((r) => r.destHit).length;
    const n33WithEither = c33DestHits.filter((r) => r.buyerHit || r.destHit).length;

    // Schema answer
    const orderFieldsRelevant = {
        buyerFullName: 'acquirente',
        deceasedName: 'defunto (tomba) — proxy destinatario consegna, NON intestatario biglietto separato',
        ticketMessage: 'messaggio biglietto (testo libero)',
        additionalInstructions: 'istruzioni aggiuntive (testo libero)',
        agencyName: 'agenzia funebre B2B',
        dedicatedRecipientField: false,
        note: 'Nessun campo Order.recipientName / deliveryAddressee. recipientName esiste su OfferRedemption, non su Order.',
    };

    // ——— Misura 3a RICAVI_VENDITE ———
    const allRows = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            fiscalYear: 2026,
            sourceType: { not: 'CUSTOMER_RECEIPT' },
        },
        select: {
            id: true,
            totalCents: true,
            direction: true,
            sourceType: true,
            sourceId: true,
            sourceKey: true,
            orderId: true,
            documentRef: true,
            bankLineId: true,
            vatCents: true,
            netCents: true,
            accountingDate: true,
            metadataJson: true,
            category: true,
        },
    });
    const usable = applyFiscalAuthorityHierarchy(allRows as any);
    const rv = usable.filter((r) => r.category === 'RICAVI_VENDITE');
    let pos = 0,
        neg = 0,
        nPos = 0,
        nNeg = 0;
    let ppNeg = 0,
        nPpNeg = 0;
    let pnlVendite = 0;
    let costBranch = 0;
    for (const r of rv) {
        if (r.totalCents > 0) {
            pos += r.totalCents;
            nPos++;
        } else if (r.totalCents < 0) {
            neg += r.totalCents;
            nNeg++;
            if (r.sourceType === 'PAYPAL_MOVEMENT') {
                ppNeg += r.totalCents;
                nPpNeg++;
            }
        }
        if (r.direction === 'ENTRATA' || r.totalCents > 0) {
            pnlVendite += Math.abs(r.totalCents);
        } else {
            costBranch += Math.abs(r.totalCents);
        }
    }
    const pnl = await computeHistoricalPnl({ fiscalYear: 2026 });

    // ——— Misura 3b lista vs incasso ———
    const stripeEu = await prisma.stripeFinanceMovement.findMany({
        where: { stripeId: { startsWith: 'stripe_eu_' }, type: { in: ['charge', 'payment'] } },
        select: {
            id: true,
            type: true,
            amountCents: true,
            feeCents: true,
            createdAtStripe: true,
            description: true,
            orderId: true,
        },
    });
    const pp = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            fiscalYear: 2026,
            sourceType: 'PAYPAL_MOVEMENT',
            direction: 'ENTRATA',
            totalCents: { gt: 0 },
        },
        select: {
            id: true,
            totalCents: true,
            accountingDate: true,
            counterpartyName: true,
            description: true,
        },
    });

    function day(d: Date) {
        return d.toISOString().slice(0, 10);
    }
    function daysBetweenIso(a: string, b: string) {
        return Math.abs(Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 86400000;
    }

    type IncassoMatch = {
        eu: (typeof ALL_EU)[0];
        channel: string;
        collectedCents: number;
        deltaCents: number;
        ref: string;
    };
    const incassi: IncassoMatch[] = [];
    const usedStripe = new Set<string>();
    const usedPp = new Set<string>();

    for (const eu of ALL_EU) {
        if (eu.nameless) continue;
        // Prefer charge over payment, amount within 1 or known Isabella-style
        let bestStripe: (typeof stripeEu)[0] | null = null;
        let bestDiff = Infinity;
        for (const m of stripeEu) {
            if (usedStripe.has(m.id)) continue;
            if (m.type !== 'charge' && m.type !== 'payment') continue;
            const d = daysBetweenIso(eu.date, day(m.createdAtStripe));
            if (d > 5) continue;
            const diff = Math.abs(m.amountCents - eu.cents);
            // allow exact or small; also allow larger if name in desc (rare)
            if (diff <= 1 || (diff <= 2000 && d <= 2)) {
                if (diff < bestDiff || (diff === bestDiff && m.type === 'charge')) {
                    bestDiff = diff;
                    bestStripe = m;
                }
            }
        }
        // tighter: prefer amount within €20 for named
        if (bestStripe && bestDiff <= 2000) {
            // For exact-ish prefer
            const exactish = stripeEu.filter((m) => {
                if (usedStripe.has(m.id)) return false;
                const d = daysBetweenIso(eu.date, day(m.createdAtStripe));
                return d <= 3 && Math.abs(m.amountCents - eu.cents) <= 1 && m.type === 'charge';
            });
            if (exactish.length === 1) bestStripe = exactish[0]!;
            else if (exactish.length === 0) {
                // Isabella-like: same day charge within €50 below list
                const near = stripeEu.filter((m) => {
                    if (usedStripe.has(m.id)) return false;
                    if (m.type !== 'charge') return false;
                    const d = daysBetweenIso(eu.date, day(m.createdAtStripe));
                    return d <= 2 && m.amountCents < eu.cents && eu.cents - m.amountCents <= 5000 && eu.cents - m.amountCents >= 100;
                });
                if (near.length === 1) bestStripe = near[0]!;
                else if (bestDiff > 1 && exactish.length === 0 && near.length !== 1) {
                    // only keep if bestDiff <= 1
                    if (bestDiff > 1) bestStripe = null;
                }
            }
        } else {
            bestStripe = null;
        }

        // Rebuild cleaner: exact charge ±3d first
        const exactCharge = stripeEu.filter((m) => {
            if (usedStripe.has(m.id)) return false;
            if (m.type !== 'charge') return false;
            return daysBetweenIso(eu.date, day(m.createdAtStripe)) <= 3 && Math.abs(m.amountCents - eu.cents) <= 1;
        });
        if (exactCharge.length >= 1) {
            const m = exactCharge.sort(
                (a, b) =>
                    daysBetweenIso(eu.date, day(a.createdAtStripe)) -
                    daysBetweenIso(eu.date, day(b.createdAtStripe))
            )[0]!;
            usedStripe.add(m.id);
            incassi.push({
                eu,
                channel: 'Stripe EU charge',
                collectedCents: m.amountCents,
                deltaCents: eu.cents - m.amountCents,
                ref: `${day(m.createdAtStripe)} ${euro(m.amountCents)}`,
            });
            continue;
        }
        // near charge (list > charge, delta ≤ €50, same ±2d) — Isabella pattern
        const nearCharge = stripeEu.filter((m) => {
            if (usedStripe.has(m.id)) return false;
            if (m.type !== 'charge') return false;
            const d = daysBetweenIso(eu.date, day(m.createdAtStripe));
            const delta = eu.cents - m.amountCents;
            return d <= 2 && delta >= 100 && delta <= 5000;
        });
        if (nearCharge.length === 1) {
            const m = nearCharge[0]!;
            usedStripe.add(m.id);
            incassi.push({
                eu,
                channel: 'Stripe EU charge (near)',
                collectedCents: m.amountCents,
                deltaCents: eu.cents - m.amountCents,
                ref: `${day(m.createdAtStripe)} ${euro(m.amountCents)}`,
            });
            continue;
        }
        // PayPal by name + amount ±5d
        const ppHits = pp.filter((p) => {
            if (usedPp.has(p.id)) return false;
            if (!p.accountingDate) return false;
            const d = daysBetweenIso(eu.date, day(p.accountingDate));
            if (d > 5) return false;
            if (Math.abs(p.totalCents - eu.cents) > 1) return false;
            const cp = p.counterpartyName || '';
            const desc = p.description || '';
            return nameScore(eu.customer, cp) >= 0.75 || nameScore(eu.customer, desc) >= 0.75;
        });
        if (ppHits.length === 1) {
            const p = ppHits[0]!;
            usedPp.add(p.id);
            incassi.push({
                eu,
                channel: 'PayPal',
                collectedCents: p.totalCents,
                deltaCents: eu.cents - p.totalCents,
                ref: `${day(p.accountingDate!)} ${euro(p.totalCents)}`,
            });
            continue;
        }
        // PayPal amount-only ±1d (weak)
        const ppAmt = pp.filter((p) => {
            if (usedPp.has(p.id)) return false;
            if (!p.accountingDate) return false;
            return (
                daysBetweenIso(eu.date, day(p.accountingDate)) <= 1 &&
                Math.abs(p.totalCents - eu.cents) <= 1
            );
        });
        if (ppAmt.length === 1) {
            const p = ppAmt[0]!;
            usedPp.add(p.id);
            incassi.push({
                eu,
                channel: 'PayPal amount±1d',
                collectedCents: p.totalCents,
                deltaCents: 0,
                ref: `${day(p.accountingDate!)} ${euro(p.totalCents)}`,
            });
        }
    }

    const withDelta = incassi.filter((i) => Math.abs(i.deltaCents) > 1);
    const deltaTotal = withDelta.reduce((s, i) => s + i.deltaCents, 0);
    const matchedList = incassi.reduce((s, i) => s + i.eu.cents, 0);
    const matchedCollected = incassi.reduce((s, i) => s + i.collectedCents, 0);
    const allList = ALL_EU.reduce((s, e) => s + e.cents, 0);
    // ricalcolo .eu: matched use collected, unmatched keep list
    const matchedKeys = new Set(incassi.map((i) => `${i.eu.date}|${i.eu.customer}|${i.eu.cents}`));
    let euOnCollected = 0;
    for (const e of ALL_EU) {
        const hit = incassi.find(
            (i) => i.eu.date === e.date && i.eu.customer === e.customer && i.eu.cents === e.cents
        );
        euOnCollected += hit ? hit.collectedCents : e.cents;
    }

    // ——— Lotto 3 post ———
    const batchId = 'FASE4B_L3_20260906_215954';
    const batchN = await prisma.financialLedgerEntry.count({
        where: { metadataJson: { path: ['fase4bBatchId'], equals: batchId } },
    });
    const snapshot = {
        at: '2026-09-06T21:53:19.251Z',
        vendite: 573632,
        rai: -268471,
        expectedVendite: 272852,
        expectedRai: 32309,
    };

    const report = {
        generatedAt: new Date().toISOString(),
        readOnly: true,
        orderSchema: orderFieldsRelevant,
        section1_catalogNameOnly: {
            uniqueCustomers: uniqueNames.length,
            groupCRows: GROUP_C.length,
            nWithAtLeastOneBuyerOrder: uniqueNames.filter(
                (n) => catalogByCustomer[n]!.buyerMatches.length > 0
            ).length,
            nWithZeroBuyerOrders: uniqueNames.filter(
                (n) => catalogByCustomer[n]!.buyerMatches.length === 0
            ).length,
            byCustomer: Object.fromEntries(
                uniqueNames.map((n) => [
                    n,
                    {
                        listRows: catalogByCustomer[n]!.listRows.map((r) => ({
                            date: r.date,
                            list: euro(r.cents),
                        })),
                        ordersCom: catalogByCustomer[n]!.buyerMatches.map((o) => ({
                            orderNumber: o.orderNumber,
                            date: o.date,
                            deliveryDate: o.deliveryDate,
                            amount: euro(o.cents),
                            status: o.status,
                            partnerPayment: o.pay,
                            buyer: o.buyer,
                            deceased: o.deceased,
                            nameScore: o.score,
                        })),
                    },
                ])
            ),
        },
        section2_destinatario: {
            dedicatedField: false,
            proxyFields: ['deceasedName', 'ticketMessage', 'additionalInstructions', 'agencyName'],
            of33_buyerNameHit: n33WithBuyer,
            of33_destProxyHit: n33WithDest,
            of33_eitherHit: n33WithEither,
            rows: c33DestHits,
            uniqueCustomersWithDestHit: uniqueNames.filter(
                (n) => catalogByCustomer[n]!.deceasedMatches.length > 0
            ).length,
            destCatalog: Object.fromEntries(
                uniqueNames
                    .filter((n) => catalogByCustomer[n]!.deceasedMatches.length > 0)
                    .map((n) => [
                        n,
                        catalogByCustomer[n]!.deceasedMatches.map((d) => ({
                            orderNumber: d.orderNumber,
                            date: d.date,
                            amount: euro(d.cents),
                            status: d.status,
                            via: d.via,
                            buyer: d.buyer,
                            deceased: d.deceased,
                        })),
                    ])
            ),
        },
        section3a_ricaviVendite: {
            hierarchyPositivi: { n: nPos, euro: euro(pos), cents: pos },
            hierarchyNegativi: { n: nNeg, euro: euro(neg), cents: neg },
            sommaAlgebrica: { euro: euro(pos + neg), cents: pos + neg },
            paypalNegativiSubset: { n: nPpNeg, euro: euro(ppNeg), cents: ppNeg },
            pnlBranch: {
                countedAsRicavi: { euro: euro(pnlVendite), cents: pnlVendite },
                countedAsCosti: { euro: euro(costBranch), cents: costBranch },
            },
            venditeCaratteristicheMotore: {
                euro: euro(pnl.venditeCaratteristicheCents ?? 0),
                cents: pnl.venditeCaratteristicheCents ?? 0,
            },
            conclusione:
                'I negativi NON entrano in venditeCaratteristicheCents (ramo costi). Algebrica ≠ vendite motore. I ≈€1.623 PayPal negativi (subset) non deprimono il totale vendite.',
        },
        section3b_listaVsIncasso: {
            matchedN: incassi.length,
            withDeltaN: withDelta.length,
            deltaTotal: euro(deltaTotal),
            deltaTotalCents: deltaTotal,
            deltas: withDelta.map((i) => ({
                date: i.eu.date,
                customer: i.eu.customer,
                list: euro(i.eu.cents),
                collected: euro(i.collectedCents),
                delta: euro(i.deltaCents),
                channel: i.channel,
                ref: i.ref,
            })),
            matchedListSum: euro(matchedList),
            matchedCollectedSum: euro(matchedCollected),
            eu43List: euro(allList),
            eu43OnCollectedWhereMatchedElseList: euro(euOnCollected),
            allMatches: incassi.map((i) => ({
                date: i.eu.date,
                customer: i.eu.customer,
                list: euro(i.eu.cents),
                collected: euro(i.collectedCents),
                delta: euro(i.deltaCents),
                channel: i.channel,
            })),
        },
        section4_lotto3: {
            batchId,
            rowsTouched: batchN,
            snapshotRef: snapshot,
            post: {
                vendite: pnl.venditeCaratteristicheCents,
                venditeEuro: euro(pnl.venditeCaratteristicheCents ?? 0),
                rai: pnl.risultatoAnteImposteCents,
                raiEuro: euro(pnl.risultatoAnteImposteCents),
                ricaviLordi: euro(pnl.ricaviLordiCents),
                ivaDebito: euro(pnl.ivaDebitoCents),
                ivaCredito: euro(pnl.ivaCreditoCents),
                ivaNetta: euro(pnl.ivaNettaCents),
                banca: euro(pnl.cashBankBalanceCents ?? 0),
                cashGatewayTransfer: euro(pnl.cashGatewayTransferCents ?? 0),
            },
            vsDryRun: {
                expectedVendite: euro(snapshot.expectedVendite),
                actualVendite: euro(pnl.venditeCaratteristicheCents ?? 0),
                venditeDelta: euro((pnl.venditeCaratteristicheCents ?? 0) - snapshot.expectedVendite),
                expectedRai: euro(snapshot.expectedRai),
                actualRai: euro(pnl.risultatoAnteImposteCents),
                raiDelta: euro(pnl.risultatoAnteImposteCents - snapshot.expectedRai),
                noteVendite:
                    'Atteso dry-run €2728,52 sottraeva €3007,80 interi; €191,47 già esclusi da filtro pose → post reale €2919,99',
                noteRai:
                    'Dry-run aveva segno invertito (+323). Corretto: −2684,71 − 3007,80 = −5692,51',
            },
        },
    };

    const outJson = join(process.cwd(), 'docs/verbali/dossier_fase4b_eu_gate_c.json');
    writeFileSync(outJson, JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify({
        section1: {
            uniqueCustomers: report.section1_catalogNameOnly.uniqueCustomers,
            withBuyer: report.section1_catalogNameOnly.nWithAtLeastOneBuyerOrder,
            withoutBuyer: report.section1_catalogNameOnly.nWithZeroBuyerOrders,
        },
        section2: {
            dedicatedField: false,
            of33_buyer: n33WithBuyer,
            of33_dest: n33WithDest,
            of33_either: n33WithEither,
        },
        section3a: report.section3a_ricaviVendite,
        section3b: {
            matchedN: incassi.length,
            withDeltaN: withDelta.length,
            deltaTotal: euro(deltaTotal),
            eu43OnCollected: euro(euOnCollected),
            deltas: withDelta,
        },
        section4: report.section4_lotto3,
    }, null, 2));
    console.log('Wrote', outJson);
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(async () => {
        try {
            await prisma.$disconnect();
        } catch {
            /* */
        }
    });
