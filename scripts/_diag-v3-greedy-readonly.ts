import fs from 'node:fs';
import { resolveQuarterBounds } from '@/lib/financial/taxQuarterly';
import { buildGatewayCorrispettivi } from '@/lib/financial/dossierCorrispettiviBuild';
import prisma from '@/lib/prisma';

function parseEuroIt(s: string): number {
    const t = s.replace(/[€\s]/g, '').trim();
    if (!t) return 0;
    if (t.includes(',') && t.includes('.')) {
        return Math.round(Number(t.replace(/\./g, '').replace(',', '.')) * 100);
    }
    if (t.includes(',')) return Math.round(Number(t.replace(',', '.')) * 100);
    return Math.round(Number(t) * 100);
}
function listaDateToIso(dmy: string): string | null {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dmy.trim());
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
function quarterOf(iso: string): 1 | 2 | 3 | 4 {
    const m = Number(iso.slice(5, 7));
    return Math.ceil(m / 3) as 1 | 2 | 3 | 4;
}

async function main() {
    const csv = fs.readFileSync('docs/verbali/FloreMoria_Ordini_Operativi.csv', 'utf8');
    const lista: Array<{
        orderNumber: string;
        date: string;
        iso: string;
        priceCents: number;
        q: number;
    }> = [];
    for (const line of csv.split(/\r?\n/).slice(1)) {
        if (!line.trim() || line.startsWith(';')) continue;
        const p = line.split(';');
        if (p.length < 7) continue;
        const orderNumber = (p[2] || '').trim();
        if (!/^F[FT]-/i.test(orderNumber)) continue;
        const priceCents = parseEuroIt(p[6] || '0');
        if (priceCents <= 0) continue;
        const iso = listaDateToIso((p[0] || '').trim());
        if (!iso) continue;
        lista.push({ orderNumber, date: p[0].trim(), iso, priceCents, q: quarterOf(iso) });
    }

    const gw: Array<{
        q: number;
        orderNumber: string;
        date: string;
        grossCents: number;
        tx: string;
        gateway: string;
    }> = [];
    for (const q of [1, 2, 3] as const) {
        const b = resolveQuarterBounds(2026, q);
        const built = await buildGatewayCorrispettivi({ start: b.start, end: b.end });
        for (const r of built.rows) {
            gw.push({
                q,
                orderNumber: (r.orderNumber || '').trim() || 'DA_COLLEGARE',
                date: r.date,
                grossCents: r.grossCents,
                tx: r.transactionId,
                gateway: r.canaleIncasso,
            });
        }
    }

    const extras: typeof gw = [];
    const missingFromGw: typeof lista = [];
    for (const q of [1, 2, 3]) {
        const L = lista.filter((l) => l.q === q).map((l) => ({ ...l, used: false }));
        const G = gw.filter((g) => g.q === q);
        for (const g of G) {
            const byOrd = L.find(
                (l) => !l.used && l.orderNumber.toUpperCase() === g.orderNumber.toUpperCase()
            );
            if (byOrd) {
                byOrd.used = true;
                continue;
            }
            const byAmt = L.find((l) => !l.used && l.priceCents === Math.abs(g.grossCents));
            if (byAmt) {
                byAmt.used = true;
                continue;
            }
            extras.push(g);
        }
        for (const l of L) if (!l.used) missingFromGw.push(l);
    }

    const enriched = [];
    for (const e of extras) {
        const ord =
            e.orderNumber !== 'DA_COLLEGARE'
                ? await prisma.order.findFirst({
                      where: { orderNumber: e.orderNumber },
                      select: { orderNumber: true, createdAt: true, totalPriceCents: true },
                  })
                : null;
        const sameAmtAfter = await prisma.order.findMany({
            where: {
                isTest: false,
                deletedAt: null,
                totalPriceCents: Math.abs(e.grossCents),
                createdAt: { gt: new Date('2026-09-10') },
            },
            select: { orderNumber: true, createdAt: true },
            take: 5,
        });
        enriched.push({
            q: e.q,
            orderNumber: e.orderNumber,
            date: e.date,
            euro: (e.grossCents / 100).toFixed(2),
            tx: e.tx,
            gateway: e.gateway,
            orderCreated: ord?.createdAt?.toISOString().slice(0, 10) || null,
            afterClosureSameAmt: sameAmtAfter.map(
                (o) => `${o.orderNumber}@${o.createdAt.toISOString().slice(0, 10)}`
            ),
            py: /^py_/.test(e.tx),
        });
    }

    const out = {
        lista: { n: lista.length, euro: (lista.reduce((s, l) => s + l.priceCents, 0) / 100).toFixed(2) },
        gw: { n: gw.length, euro: (gw.reduce((s, g) => s + g.grossCents, 0) / 100).toFixed(2) },
        deltaEuro: ((gw.reduce((s, g) => s + g.grossCents, 0) - 409868) / 100).toFixed(2),
        extrasN: extras.length,
        extrasEuro: (extras.reduce((s, g) => s + g.grossCents, 0) / 100).toFixed(2),
        enriched,
        missingFromGw: missingFromGw.map((l) => ({
            q: l.q,
            order: l.orderNumber,
            date: l.date,
            euro: (l.priceCents / 100).toFixed(2),
        })),
        byQ: [1, 2, 3].map((q) => ({
            q,
            listaN: lista.filter((l) => l.q === q).length,
            listaEuro: (
                lista.filter((l) => l.q === q).reduce((s, l) => s + l.priceCents, 0) / 100
            ).toFixed(2),
            gwN: gw.filter((g) => g.q === q).length,
            gwEuro: (
                gw.filter((g) => g.q === q).reduce((s, g) => s + g.grossCents, 0) / 100
            ).toFixed(2),
            extrasN: extras.filter((e) => e.q === q).length,
            extrasEuro: (
                extras.filter((e) => e.q === q).reduce((s, e) => s + e.grossCents, 0) / 100
            ).toFixed(2),
        })),
    };
    fs.writeFileSync('/tmp/diag-v3-greedy.json', JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out, null, 2));
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
