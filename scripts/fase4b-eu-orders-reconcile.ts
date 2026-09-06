/**
 * Read-only: riconciliazione ordini .eu 2026 (lista titolare) vs Order/Stripe/PayPal.
 * Uso: npx tsx scripts/fase4b-eu-orders-reconcile.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import prisma from '../lib/prisma';

function euro(c: number) {
    return (c / 100).toLocaleString('it-IT', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
    });
}
function normName(s: string) {
    return s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function tokens(s: string) {
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
    const ta = tokens(a).sort().join(' ');
    const tb = tokens(b).sort().join(' ');
    if (ta && ta === tb) return 0.98;
    const setA = new Set(tokens(a));
    const setB = new Set(tokens(b));
    if (setA.size === 0 || setB.size === 0) return 0;
    let inter = 0;
    for (const t of setA) if (setB.has(t)) inter++;
    const union = new Set([...setA, ...setB]).size;
    const jaccard = inter / union;
    if (na.includes(nb) || nb.includes(na)) return Math.max(jaccard, 0.85);
    return jaccard;
}
function dayMs(iso: string) {
    return Date.parse(iso + 'T12:00:00.000Z');
}
function daysBetween(a: string, b: Date) {
    const bd = b.toISOString().slice(0, 10);
    return Math.abs(dayMs(a) - dayMs(bd)) / 86400000;
}

const RAW = `
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
    .filter(Boolean);

type EuOrder = { idx: number; date: string; customer: string; cents: number; nameless: boolean };

async function main() {
    const euOrders: EuOrder[] = RAW.map((line, idx) => {
        const [date, customer, amount] = line.split(';');
        const cents = Math.round(parseFloat(amount) * 100);
        return {
            idx,
            date: date.trim(),
            customer: customer.trim(),
            cents,
            nameless: /^\(senza nome\)$/i.test(customer.trim()),
        };
    });
    const listTotal = euOrders.reduce((s, o) => s + o.cents, 0);

    const stripeEu = await prisma.stripeFinanceMovement.findMany({
        where: { stripeId: { startsWith: 'stripe_eu_' } },
        select: {
            id: true,
            stripeId: true,
            type: true,
            amountCents: true,
            feeCents: true,
            netCents: true,
            createdAtStripe: true,
            sourceId: true,
            payoutId: true,
            orderId: true,
            description: true,
            metadataJson: true,
        },
    });

    const byType: Record<string, { n: number; cents: number }> = {};
    for (const m of stripeEu) {
        if (!byType[m.type]) byType[m.type] = { n: 0, cents: 0 };
        byType[m.type].n++;
        byType[m.type].cents += m.amountCents;
    }
    const charges = stripeEu.filter((m) => m.type === 'charge');
    const payments = stripeEu.filter((m) => m.type === 'payment');
    const charges2026 = charges.filter((m) => m.createdAtStripe.getUTCFullYear() === 2026);
    const payments2026 = payments.filter((m) => m.createdAtStripe.getUTCFullYear() === 2026);
    const charge2026Sum = charges2026.reduce((s, m) => s + m.amountCents, 0);
    const payment2026Sum = payments2026.reduce((s, m) => s + m.amountCents, 0);
    const chargeSum = charges.reduce((s, m) => s + m.amountCents, 0);
    const paymentSum = payments.reduce((s, m) => s + m.amountCents, 0);

    // payments that duplicate a charge (same amount within 2 days)
    let dupPaymentCents = 0;
    let dupPaymentN = 0;
    for (const p of payments2026) {
        const dup = charges2026.some(
            (c) =>
                Math.abs(c.amountCents - p.amountCents) < 2 &&
                Math.abs(c.createdAtStripe.getTime() - p.createdAtStripe.getTime()) < 2 * 86400000
        );
        if (dup) {
            dupPaymentN++;
            dupPaymentCents += p.amountCents;
        }
    }

    const orders = await prisma.order.findMany({
        where: { deletedAt: null },
        select: {
            id: true,
            orderNumber: true,
            buyerFullName: true,
            totalPriceCents: true,
            createdAt: true,
            paymentMethodLabel: true,
            stripeTransactionId: true,
        },
    });

    type Match = {
        eu: EuOrder;
        status: 'PRESENT' | 'MISSING' | 'UNCERTAIN';
        reason: string;
        order?: {
            id: string;
            orderNumber: string | null;
            buyer: string | null;
            cents: number;
            date: string;
            pay: string | null;
            score: number;
        };
    };
    const usedOrderIds = new Set<string>();
    const matches: Match[] = [];

    for (const eu of euOrders) {
        if (eu.nameless) {
            matches.push({ eu, status: 'UNCERTAIN', reason: 'senza nome' });
            continue;
        }
        let best: { o: (typeof orders)[0]; score: number; dayDiff: number } | null = null;
        for (const o of orders) {
            if (usedOrderIds.has(o.id)) continue;
            if (Math.abs(o.totalPriceCents - eu.cents) > 1) continue;
            const dayDiff = daysBetween(eu.date, o.createdAt);
            if (dayDiff > 3) continue;
            const score = nameScore(eu.customer, o.buyerFullName || '');
            if (score < 0.55) continue;
            if (!best || score > best.score || (score === best.score && dayDiff < best.dayDiff)) {
                best = { o, score, dayDiff };
            }
        }
        if (best && best.score >= 0.75) {
            usedOrderIds.add(best.o.id);
            matches.push({
                eu,
                status: 'PRESENT',
                reason: `score=${best.score.toFixed(2)} dayΔ=${best.dayDiff.toFixed(1)}`,
                order: {
                    id: best.o.id,
                    orderNumber: best.o.orderNumber,
                    buyer: best.o.buyerFullName,
                    cents: best.o.totalPriceCents,
                    date: best.o.createdAt.toISOString().slice(0, 10),
                    pay: best.o.paymentMethodLabel,
                    score: best.score,
                },
            });
        } else if (best && best.score >= 0.55) {
            matches.push({
                eu,
                status: 'UNCERTAIN',
                reason: `weak name score=${best.score.toFixed(2)} dayΔ=${best.dayDiff.toFixed(1)} vs "${best.o.buyerFullName}"`,
                order: {
                    id: best.o.id,
                    orderNumber: best.o.orderNumber,
                    buyer: best.o.buyerFullName,
                    cents: best.o.totalPriceCents,
                    date: best.o.createdAt.toISOString().slice(0, 10),
                    pay: best.o.paymentMethodLabel,
                    score: best.score,
                },
            });
        } else {
            const amtDate = orders.filter(
                (o) =>
                    !usedOrderIds.has(o.id) &&
                    Math.abs(o.totalPriceCents - eu.cents) <= 1 &&
                    daysBetween(eu.date, o.createdAt) <= 3
            );
            if (amtDate.length === 1) {
                const o = amtDate[0];
                const score = nameScore(eu.customer, o.buyerFullName || '');
                matches.push({
                    eu,
                    status: 'UNCERTAIN',
                    reason: `unico importo+data±3, nameScore=${score.toFixed(2)} vs "${o.buyerFullName}"`,
                    order: {
                        id: o.id,
                        orderNumber: o.orderNumber,
                        buyer: o.buyerFullName,
                        cents: o.totalPriceCents,
                        date: o.createdAt.toISOString().slice(0, 10),
                        pay: o.paymentMethodLabel,
                        score,
                    },
                });
            } else if (amtDate.length > 1) {
                matches.push({
                    eu,
                    status: 'UNCERTAIN',
                    reason: `${amtDate.length} candidati importo+data: ${amtDate.map((o) => o.buyerFullName).join(' | ')}`,
                });
            } else {
                matches.push({ eu, status: 'MISSING', reason: 'nessun Order importo+data±3' });
            }
        }
    }

    const present = matches.filter((m) => m.status === 'PRESENT');
    const missing = matches.filter((m) => m.status === 'MISSING');
    const uncertain = matches.filter((m) => m.status === 'UNCERTAIN');
    const sumM = (arr: Match[]) => arr.reduce((s, m) => s + m.eu.cents, 0);

    // Stripe match: charges2026 first, then non-dup payments
    const stripePool = [
        ...charges2026,
        ...payments2026.filter(
            (p) =>
                !charges2026.some(
                    (c) =>
                        Math.abs(c.amountCents - p.amountCents) < 2 &&
                        Math.abs(c.createdAtStripe.getTime() - p.createdAtStripe.getTime()) < 2 * 86400000
                )
        ),
    ];
    const usedStripe = new Set<string>();
    const stripeMatches = euOrders.map((eu) => {
        let best: { m: (typeof stripePool)[0]; dayDiff: number } | null = null;
        for (const m of stripePool) {
            if (usedStripe.has(m.id)) continue;
            if (Math.abs(m.amountCents - eu.cents) > 1) continue;
            const dayDiff = daysBetween(eu.date, m.createdAtStripe);
            if (dayDiff > 5) continue;
            if (!best || dayDiff < best.dayDiff) best = { m, dayDiff };
        }
        if (best) {
            usedStripe.add(best.m.id);
            return {
                eu,
                hit: true as const,
                stripe: {
                    type: best.m.type,
                    cents: best.m.amountCents,
                    date: best.m.createdAtStripe.toISOString().slice(0, 10),
                    id: best.m.stripeId,
                },
                note: `dayΔ=${best.dayDiff.toFixed(1)}`,
            };
        }
        return { eu, hit: false as const, note: 'no stripe amount±5d' };
    });
    const stripeHit = stripeMatches.filter((s) => s.hit);
    const stripeMiss = stripeMatches.filter((s) => !s.hit);
    const orphanCharges = charges2026.filter((c) => !usedStripe.has(c.id));

    const ppCredits = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceType: 'PAYPAL_MOVEMENT',
            OR: [{ direction: 'ENTRATA' }, { totalCents: { gt: 0 } }],
        },
        select: {
            id: true,
            totalCents: true,
            accountingDate: true,
            description: true,
            counterpartyName: true,
            category: true,
        },
    });
    const usedPp = new Set<string>();
    const ppMatches = euOrders.map((eu) => {
        let best: { p: (typeof ppCredits)[0]; score: number; dayDiff: number } | null = null;
        for (const p of ppCredits) {
            if (usedPp.has(p.id)) continue;
            if (Math.abs(p.totalCents - eu.cents) > 1) continue;
            const dayDiff = daysBetween(eu.date, p.accountingDate);
            if (dayDiff > 5) continue;
            const blob = `${p.description || ''} ${p.counterpartyName || ''}`;
            const score = eu.nameless
                ? 0.5
                : Math.max(nameScore(eu.customer, p.counterpartyName || ''), nameScore(eu.customer, blob));
            if (!eu.nameless && score < 0.45 && dayDiff > 1) continue;
            if (!best || score > best.score || (score === best.score && dayDiff < best.dayDiff)) {
                best = { p, score, dayDiff };
            }
        }
        if (!best) {
            const cands = ppCredits.filter(
                (p) =>
                    !usedPp.has(p.id) &&
                    Math.abs(p.totalCents - eu.cents) <= 1 &&
                    daysBetween(eu.date, p.accountingDate) <= 3
            );
            if (cands.length === 1) {
                best = {
                    p: cands[0],
                    score: eu.nameless ? 0.4 : nameScore(eu.customer, cands[0].counterpartyName || ''),
                    dayDiff: daysBetween(eu.date, cands[0].accountingDate),
                };
            }
        }
        if (best && (best.score >= 0.45 || eu.nameless || best.dayDiff <= 1)) {
            usedPp.add(best.p.id);
            return {
                eu,
                hit: true as const,
                pp: {
                    cents: best.p.totalCents,
                    date: best.p.accountingDate.toISOString().slice(0, 10),
                    desc: `${best.p.counterpartyName || ''} | ${(best.p.description || '').slice(0, 70)}`,
                },
                note: `score=${best.score.toFixed(2)} dayΔ=${best.dayDiff.toFixed(1)}`,
            };
        }
        return { eu, hit: false as const, note: 'no paypal credit' };
    });
    const ppHit = ppMatches.filter((p) => p.hit);

    const missingCents = sumM(missing);
    const vatMissing = Math.round(missingCents - missingCents / 1.1);
    const bookVat = 13497;

    const report = {
        list: { n: euOrders.length, euro: euro(listTotal), cents: listTotal },
        stripeReconciliation: {
            recordsTotal: stripeEu.length,
            byType: Object.fromEntries(
                Object.entries(byType).map(([k, v]) => [k, { n: v.n, euro: euro(v.cents) }])
            ),
            naiveChargePlusPayment: euro(chargeSum + paymentSum),
            diagnosis:
                '€3732,14 = somma charge+payment. Molti payment sono la stessa transazione del charge (Balance Transaction types). Conteggio corretto ≈ solo charge 2026.',
            charges2026: { n: charges2026.length, euro: euro(charge2026Sum) },
            payments2026: { n: payments2026.length, euro: euro(payment2026Sum) },
            paymentsLikelyDupOfCharge: { n: dupPaymentN, euro: euro(dupPaymentCents) },
            charges2026_vs_list: {
                charges: euro(charge2026Sum),
                list: euro(listTotal),
                delta: euro(charge2026Sum - listTotal),
            },
            chargePlusPayment_vs_list: euro(chargeSum + paymentSum - listTotal),
        },
        orderMatch: {
            PRESENT: {
                n: present.length,
                euro: euro(sumM(present)),
                rows: present.map((m) => ({
                    eu: `${m.eu.date};${m.eu.customer};${(m.eu.cents / 100).toFixed(2)}`,
                    com: `${m.order?.date};${m.order?.buyer};${m.order?.orderNumber};${m.order?.pay}`,
                    reason: m.reason,
                })),
            },
            MISSING: {
                n: missing.length,
                euro: euro(sumM(missing)),
                rows: missing.map((m) => `${m.eu.date};${m.eu.customer};${(m.eu.cents / 100).toFixed(2)}`),
            },
            UNCERTAIN: {
                n: uncertain.length,
                euro: euro(sumM(uncertain)),
                rows: uncertain.map((m) => ({
                    eu: `${m.eu.date};${m.eu.customer};${(m.eu.cents / 100).toFixed(2)}`,
                    reason: m.reason,
                    com: m.order ? `${m.order.date};${m.order.buyer};${m.order.orderNumber}` : null,
                })),
            },
        },
        stripeVs43: {
            matched: {
                n: stripeHit.length,
                euro: euro(stripeHit.reduce((s, x) => s + x.eu.cents, 0)),
            },
            unmatchedOrders: {
                n: stripeMiss.length,
                euro: euro(stripeMiss.reduce((s, x) => s + x.eu.cents, 0)),
                rows: stripeMiss.map(
                    (x) => `${x.eu.date};${x.eu.customer};${(x.eu.cents / 100).toFixed(2)}`
                ),
            },
            orphanCharges2026: {
                n: orphanCharges.length,
                euro: euro(orphanCharges.reduce((s, c) => s + c.amountCents, 0)),
                sample: orphanCharges.slice(0, 20).map((c) => ({
                    date: c.createdAtStripe.toISOString().slice(0, 10),
                    euro: euro(c.amountCents),
                    desc: (c.description || '').slice(0, 80),
                })),
            },
        },
        paypalVs43: {
            matched: {
                n: ppHit.length,
                euro: euro(ppHit.reduce((s, x) => s + x.eu.cents, 0)),
                rows: ppHit.map((x) => ({
                    eu: `${x.eu.date};${x.eu.customer};${(x.eu.cents / 100).toFixed(2)}`,
                    pp: x.pp,
                    note: x.note,
                })),
            },
            unmatchedN: ppMatches.filter((p) => !p.hit).length,
        },
        gatewayCoverage: {
            stripeOnly: euOrders.filter((eu) => {
                const s = stripeMatches.find((x) => x.eu.idx === eu.idx)!;
                const p = ppMatches.find((x) => x.eu.idx === eu.idx)!;
                return s.hit && !p.hit;
            }).length,
            paypalOnly: euOrders.filter((eu) => {
                const s = stripeMatches.find((x) => x.eu.idx === eu.idx)!;
                const p = ppMatches.find((x) => x.eu.idx === eu.idx)!;
                return p.hit && !s.hit;
            }).length,
            both: euOrders.filter((eu) => {
                const s = stripeMatches.find((x) => x.eu.idx === eu.idx)!;
                const p = ppMatches.find((x) => x.eu.idx === eu.idx)!;
                return s.hit && p.hit;
            }).length,
            neither: euOrders
                .filter((eu) => {
                    const s = stripeMatches.find((x) => x.eu.idx === eu.idx)!;
                    const p = ppMatches.find((x) => x.eu.idx === eu.idx)!;
                    return !s.hit && !p.hit;
                })
                .map((eu) => `${eu.date};${eu.customer};${(eu.cents / 100).toFixed(2)}`),
        },
        iva: {
            missingGross: euro(missingCents),
            missingCents,
            theoreticalVat10onMissing: euro(vatMissing),
            vatMissingCents: vatMissing,
            bookIvaDebito: euro(bookVat),
            bookPlusTheoretical: euro(bookVat + vatMissing),
            scostamentoAggiuntivoTeorico: euro(vatMissing),
            note: '10% floreale sul lordo dei soli NON PRESENTI; accessori 22% non scorporati. Confronta col libro €134,97.',
        },
    };

    console.log(JSON.stringify(report, null, 2));
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
            /* ignore */
        }
    });
