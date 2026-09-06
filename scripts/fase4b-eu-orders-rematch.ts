/**
 * Read-only: rimatch .eu 2026 vs Order con gerarchia corretta.
 * 1° email · 2° nome normalizzato + data ±3g · 3° importo solo conferma.
 * Uso: npx tsx scripts/fase4b-eu-orders-rematch.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { writeFileSync } from 'fs';
import { join } from 'path';
import prisma from '../lib/prisma';

function euro(c: number) {
    return (c / 100).toLocaleString('it-IT', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
    });
}

function iva10(grossCents: number) {
    return Math.round(grossCents / 11);
}

function quarterOf(isoDate: string): 'T1' | 'T2' | 'T3' | 'T4' {
    const m = Number(isoDate.slice(5, 7));
    if (m <= 3) return 'T1';
    if (m <= 6) return 'T2';
    if (m <= 9) return 'T3';
    return 'T4';
}

/** Normalizzazione robusta: accenti, apostrofi, case, spazi, ordine token. */
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

function sortedTokenKey(s: string): string {
    return nameTokens(s).sort().join(' ');
}

function nameScore(a: string, b: string): number {
    if (!a || !b) return 0;
    if (/senza nome/i.test(a) || /senza nome/i.test(b)) return 0;
    const na = normName(a);
    const nb = normName(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;
    const ta = sortedTokenKey(a);
    const tb = sortedTokenKey(b);
    if (ta && ta === tb) return 0.99; // stesso set token, ordine invertito
    const setA = new Set(nameTokens(a));
    const setB = new Set(nameTokens(b));
    if (setA.size === 0 || setB.size === 0) return 0;
    let inter = 0;
    for (const t of setA) if (setB.has(t)) inter++;
    const union = new Set([...setA, ...setB]).size;
    const jaccard = inter / union;
    // almeno cognome+nome sostanziali
    if (inter >= 2 && jaccard >= 0.5) return Math.max(jaccard, 0.85);
    if (na.includes(nb) || nb.includes(na)) return Math.max(jaccard, 0.8);
    return jaccard;
}

function dayMs(iso: string) {
    return Date.parse(iso + 'T12:00:00.000Z');
}

function daysBetween(a: string, b: Date) {
    const bd = b.toISOString().slice(0, 10);
    return Math.abs(dayMs(a) - dayMs(bd)) / 86400000;
}

function isCompositeAmount(cents: number): boolean {
    // non finisce per ,99 (centesimi != 99)
    return cents % 100 !== 99;
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

type EuOrder = {
    idx: number;
    date: string;
    customer: string;
    cents: number;
    nameless: boolean;
    composite: boolean;
    emailHint: string | null;
};

type ComOrder = {
    id: string;
    orderNumber: string | null;
    buyerFullName: string | null;
    buyerEmail: string | null;
    totalPriceCents: number;
    createdAt: Date;
    status: string;
};

type Bucket = 'A' | 'B' | 'C' | 'D';

type MatchRow = {
    bucket: Bucket;
    eu: EuOrder;
    method: string;
    deltaCents: number;
    comOrders: Array<{
        id: string;
        orderNumber: string | null;
        buyer: string | null;
        email: string | null;
        cents: number;
        date: string;
        score: number;
    }>;
    note: string;
};

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
            composite: isCompositeAmount(cents),
            emailHint: null,
        };
    });
    const listTotal = euOrders.reduce((s, o) => s + o.cents, 0);

    const orders: ComOrder[] = await prisma.order.findMany({
        where: { deletedAt: null },
        select: {
            id: true,
            orderNumber: true,
            buyerFullName: true,
            buyerEmail: true,
            totalPriceCents: true,
            createdAt: true,
            status: true,
        },
    });

    const usedOrderIds = new Set<string>();
    const rows: MatchRow[] = [];

    function inWindow(o: ComOrder, euDate: string, tol = 3) {
        return daysBetween(euDate, o.createdAt) <= tol;
    }

    function pack(o: ComOrder, score: number) {
        return {
            id: o.id,
            orderNumber: o.orderNumber,
            buyer: o.buyerFullName,
            email: o.buyerEmail,
            cents: o.totalPriceCents,
            date: o.createdAt.toISOString().slice(0, 10),
            score,
        };
    }

    for (const eu of euOrders) {
        if (eu.nameless) {
            rows.push({
                bucket: 'D',
                eu,
                method: 'nameless',
                deltaCents: 0,
                comOrders: [],
                note: 'senza nome su lista — nessun match nome possibile',
            });
            continue;
        }

        const windowOrders = orders.filter((o) => !usedOrderIds.has(o.id) && inWindow(o, eu.date, 3));

        // 1° EMAIL (solo se entrambi hanno email — lista .eu non ha email → di fatto rarissimo)
        // Usiamo email solo se in futuro arriva; per ora cerchiamo coerenza se hint esistesse.
        if (eu.emailHint) {
            const emailNorm = eu.emailHint.trim().toLowerCase();
            const byEmail = windowOrders.filter(
                (o) => o.buyerEmail && o.buyerEmail.trim().toLowerCase() === emailNorm
            );
            if (byEmail.length === 1) {
                const o = byEmail[0]!;
                usedOrderIds.add(o.id);
                const delta = eu.cents - o.totalPriceCents;
                rows.push({
                    bucket: Math.abs(delta) <= 1 ? 'A' : 'B',
                    eu,
                    method: 'email',
                    deltaCents: delta,
                    comOrders: [pack(o, 1)],
                    note: Math.abs(delta) <= 1 ? 'email esatta, importo ok' : `email esatta, delta ${euro(delta)}`,
                });
                continue;
            }
            if (byEmail.length > 1) {
                rows.push({
                    bucket: 'D',
                    eu,
                    method: 'email_ambiguous',
                    deltaCents: 0,
                    comOrders: byEmail.map((o) => pack(o, 1)),
                    note: `email matcha ${byEmail.length} ordini`,
                });
                continue;
            }
        }

        // 2° NOME + DATA ±3
        const nameCandidates = windowOrders
            .map((o) => ({ o, score: nameScore(eu.customer, o.buyerFullName || '') }))
            .filter((x) => x.score >= 0.85)
            .sort((a, b) => b.score - a.score || Math.abs(a.o.totalPriceCents - eu.cents) - Math.abs(b.o.totalPriceCents - eu.cents));

        if (nameCandidates.length === 0) {
            rows.push({
                bucket: 'C',
                eu,
                method: 'none',
                deltaCents: eu.cents,
                comOrders: [],
                note: 'nessun Order nome+data±3',
            });
            continue;
        }

        // Importi compositi: prova somma di più ordini stesso cliente
        if (eu.composite && nameCandidates.length >= 1) {
            const sameClient = nameCandidates.filter((c) => c.score >= 0.85);
            // greedy subset sum exact
            const pool = sameClient.map((c) => c.o);
            let bestSubset: ComOrder[] | null = null;
            const n = pool.length;
            // n tipicamente piccolo (≤6): enumerazione 2^n
            if (n <= 8) {
                for (let mask = 1; mask < 1 << n; mask++) {
                    const subset: ComOrder[] = [];
                    let sum = 0;
                    for (let i = 0; i < n; i++) {
                        if (mask & (1 << i)) {
                            subset.push(pool[i]!);
                            sum += pool[i]!.totalPriceCents;
                        }
                    }
                    if (Math.abs(sum - eu.cents) <= 1) {
                        if (!bestSubset || subset.length < bestSubset.length) bestSubset = subset;
                    }
                }
            }
            if (bestSubset && bestSubset.length >= 2) {
                for (const o of bestSubset) usedOrderIds.add(o.id);
                rows.push({
                    bucket: 'A',
                    eu,
                    method: 'name_date_multi_sum',
                    deltaCents: 0,
                    comOrders: bestSubset.map((o) =>
                        pack(o, nameScore(eu.customer, o.buyerFullName || ''))
                    ),
                    note: `composito = somma ${bestSubset.length} ordini .com`,
                });
                continue;
            }
        }

        // Singolo migliore per nome+data; importo = conferma
        const best = nameCandidates[0]!;
        // Se più candidati stesso score e importi diversi → incerto se non c'è preferenza importo
        const topScore = best.score;
        const tops = nameCandidates.filter((c) => c.score >= topScore - 0.01);
        if (tops.length > 1) {
            const exactAmt = tops.filter((c) => Math.abs(c.o.totalPriceCents - eu.cents) <= 1);
            if (exactAmt.length === 1) {
                const o = exactAmt[0]!.o;
                usedOrderIds.add(o.id);
                rows.push({
                    bucket: 'A',
                    eu,
                    method: 'name_date_amount_confirm',
                    deltaCents: 0,
                    comOrders: [pack(o, exactAmt[0]!.score)],
                    note: 'nome+data; importo ha disambiguato',
                });
                continue;
            }
            if (exactAmt.length === 0 && eu.composite) {
                // registrazione parziale: prendi il più vicino inferiore
                const below = tops
                    .filter((c) => c.o.totalPriceCents < eu.cents)
                    .sort((a, b) => b.o.totalPriceCents - a.o.totalPriceCents);
                if (below.length === 1 || (below.length > 1 && below[0]!.o.totalPriceCents !== below[1]!.o.totalPriceCents)) {
                    const o = below[0]!.o;
                    usedOrderIds.add(o.id);
                    const delta = eu.cents - o.totalPriceCents;
                    rows.push({
                        bucket: 'B',
                        eu,
                        method: 'name_date_partial',
                        deltaCents: delta,
                        comOrders: [pack(o, below[0]!.score)],
                        note: `composito/parziale: .com ${euro(o.totalPriceCents)}, delta ${euro(delta)}`,
                    });
                    continue;
                }
            }
            rows.push({
                bucket: 'D',
                eu,
                method: 'name_date_ambiguous',
                deltaCents: 0,
                comOrders: tops.map((c) => pack(c.o, c.score)),
                note: `${tops.length} candidati nome+data senza disambiguazione`,
            });
            continue;
        }

        const o = best.o;
        usedOrderIds.add(o.id);
        const delta = eu.cents - o.totalPriceCents;
        if (Math.abs(delta) <= 1) {
            rows.push({
                bucket: 'A',
                eu,
                method: 'name_date_amount_ok',
                deltaCents: 0,
                comOrders: [pack(o, best.score)],
                note: 'nome+data; importo coincidente',
            });
        } else {
            rows.push({
                bucket: 'B',
                eu,
                method: 'name_date_delta',
                deltaCents: delta,
                comOrders: [pack(o, best.score)],
                note: `nome+data; delta lista−.com ${euro(delta)}`,
            });
        }
    }

    // Amanda gap: secondo ordine stesso cliente ±3g
    const amanda = rows.find((r) => /amanda favot/i.test(r.eu.customer));
    let amandaSecond: ComOrder[] = [];
    if (amanda) {
        amandaSecond = orders.filter(
            (o) =>
                nameScore('Amanda Favot', o.buyerFullName || '') >= 0.85 &&
                inWindow(o, amanda.eu.date, 3) &&
                !amanda.comOrders.some((c) => c.id === o.id)
        );
    }

    // Stripe EU "Subscription creation"
    const stripeEu = await prisma.stripeFinanceMovement.findMany({
        where: {
            stripeId: { startsWith: 'stripe_eu_' },
            type: 'charge',
        },
        select: {
            id: true,
            amountCents: true,
            description: true,
            createdAtStripe: true,
            orderId: true,
        },
    });
    const subLabel = stripeEu.filter((m) =>
        /subscription\s*creation/i.test(m.description || '')
    );
    const charges2026 = stripeEu.filter((m) => m.createdAtStripe.getUTCFullYear() === 2026);

    const byBucket = {
        A: rows.filter((r) => r.bucket === 'A'),
        B: rows.filter((r) => r.bucket === 'B'),
        C: rows.filter((r) => r.bucket === 'C'),
        D: rows.filter((r) => r.bucket === 'D'),
    };

    const sum = (arr: MatchRow[]) => arr.reduce((s, r) => s + r.eu.cents, 0);
    const deltaB = byBucket.B.reduce((s, r) => s + r.deltaCents, 0);

    // IVA teorica SOLO su C + delta di B, per trimestre
    type QKey = 'T1' | 'T2' | 'T3' | 'T4';
    const ivaByQ: Record<QKey, { baseCents: number; ivaCents: number; items: string[] }> = {
        T1: { baseCents: 0, ivaCents: 0, items: [] },
        T2: { baseCents: 0, ivaCents: 0, items: [] },
        T3: { baseCents: 0, ivaCents: 0, items: [] },
        T4: { baseCents: 0, ivaCents: 0, items: [] },
    };
    for (const r of byBucket.C) {
        const q = quarterOf(r.eu.date);
        ivaByQ[q].baseCents += r.eu.cents;
        ivaByQ[q].ivaCents += iva10(r.eu.cents);
        ivaByQ[q].items.push(`${r.eu.date} ${r.eu.customer} ${euro(r.eu.cents)} (C)`);
    }
    for (const r of byBucket.B) {
        if (r.deltaCents <= 0) continue; // solo quota non registrata
        const q = quarterOf(r.eu.date);
        ivaByQ[q].baseCents += r.deltaCents;
        ivaByQ[q].ivaCents += iva10(r.deltaCents);
        ivaByQ[q].items.push(
            `${r.eu.date} ${r.eu.customer} delta ${euro(r.deltaCents)} (B)`
        );
    }

    const ivaBaseTotal = (Object.keys(ivaByQ) as QKey[]).reduce((s, q) => s + ivaByQ[q].baseCents, 0);
    const ivaTotal = (Object.keys(ivaByQ) as QKey[]).reduce((s, q) => s + ivaByQ[q].ivaCents, 0);

    const report = {
        generatedAt: new Date().toISOString(),
        listTotal: euro(listTotal),
        listTotalCents: listTotal,
        checksumOk: listTotal === 255981,
        buckets: {
            A: {
                n: byBucket.A.length,
                total: euro(sum(byBucket.A)),
                cents: sum(byBucket.A),
                rows: byBucket.A.map((r) => ({
                    date: r.eu.date,
                    customer: r.eu.customer,
                    list: euro(r.eu.cents),
                    composite: r.eu.composite,
                    method: r.method,
                    com: r.comOrders.map((c) => `${c.orderNumber} ${euro(c.cents)} ${c.date}`),
                    note: r.note,
                })),
            },
            B: {
                n: byBucket.B.length,
                total: euro(sum(byBucket.B)),
                cents: sum(byBucket.B),
                deltaTotal: euro(deltaB),
                deltaTotalCents: deltaB,
                rows: byBucket.B.map((r) => ({
                    date: r.eu.date,
                    customer: r.eu.customer,
                    list: euro(r.eu.cents),
                    composite: r.eu.composite,
                    com: r.comOrders.map((c) => `${c.orderNumber} ${euro(c.cents)} ${c.date}`),
                    delta: euro(r.deltaCents),
                    deltaCents: r.deltaCents,
                    note: r.note,
                })),
            },
            C: {
                n: byBucket.C.length,
                total: euro(sum(byBucket.C)),
                cents: sum(byBucket.C),
                rows: byBucket.C.map((r) => ({
                    date: r.eu.date,
                    customer: r.eu.customer,
                    list: euro(r.eu.cents),
                    composite: r.eu.composite,
                    note: r.note,
                })),
            },
            D: {
                n: byBucket.D.length,
                total: euro(sum(byBucket.D)),
                cents: sum(byBucket.D),
                rows: byBucket.D.map((r) => ({
                    date: r.eu.date,
                    customer: r.eu.customer,
                    list: euro(r.eu.cents),
                    note: r.note,
                    com: r.comOrders.map((c) => `${c.orderNumber} ${euro(c.cents)}`),
                })),
            },
        },
        sumABCD: euro(sum(rows)),
        sumABCDCents: sum(rows),
        ivaTeorica_C_plus_deltaB: {
            byQuarter: Object.fromEntries(
                (Object.keys(ivaByQ) as QKey[]).map((q) => [
                    q,
                    {
                        base: euro(ivaByQ[q].baseCents),
                        iva10: euro(ivaByQ[q].ivaCents),
                        items: ivaByQ[q].items,
                    },
                ])
            ),
            baseTotal: euro(ivaBaseTotal),
            iva10Total: euro(ivaTotal),
            baseTotalCents: ivaBaseTotal,
            iva10TotalCents: ivaTotal,
        },
        amanda: {
            list: amanda ? euro(amanda.eu.cents) : null,
            bucket: amanda?.bucket ?? null,
            com: amanda?.comOrders ?? [],
            delta: amanda ? euro(amanda.deltaCents) : null,
            secondOrderSameWindow: amandaSecond.map((o) => ({
                orderNumber: o.orderNumber,
                cents: euro(o.totalPriceCents),
                date: o.createdAt.toISOString().slice(0, 10),
            })),
            gapInterpretation:
                amandaSecond.length === 0
                    ? 'nessun secondo Order Amanda ±3g → €69,99 = parte non registrata (se bucket B)'
                    : 'trovato secondo ordine',
        },
        stripeSubscriptionCreation: {
            chargesEuTotal: stripeEu.length,
            chargesEu2026: charges2026.length,
            withLabelN: subLabel.length,
            withLabel2026N: subLabel.filter((m) => m.createdAtStripe.getUTCFullYear() === 2026).length,
            sample: subLabel.slice(0, 40).map((m) => ({
                date: m.createdAtStripe.toISOString().slice(0, 10),
                amt: euro(m.amountCents),
                desc: m.description,
                orderId: m.orderId,
            })),
        },
        lotto3: { alreadyExecuted: true, batchId: 'FASE4B_L3_20260906_215954', rows: 87 },
        studioPackage: 'BLOCCATO — numeri provvisori, non inviare',
    };

    const outPath = join(
        process.cwd(),
        'docs/verbali/dossier_fase4b_eu_rematch.json'
    );
    writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify(report, null, 2));
    console.log('\nWrote', outPath);
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
