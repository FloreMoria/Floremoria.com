/**
 * V3: ricostruisce lista 75 (€4098.68) = .com CSV + .eu storico, poi diff vs gateway.
 */
import fs from 'node:fs';
import { resolveQuarterBounds } from '@/lib/financial/taxQuarterly';
import { buildGatewayCorrispettivi } from '@/lib/financial/dossierCorrispettiviBuild';
import { loadEuOrders2026Dataset } from '@/lib/financial/euOrders2026Match';
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
    return Math.ceil(Number(iso.slice(5, 7)) / 3) as 1 | 2 | 3 | 4;
}

async function main() {
    const csv = fs.readFileSync('docs/verbali/FloreMoria_Ordini_Operativi.csv', 'utf8');
    type L = {
        ref: string;
        date: string;
        priceCents: number;
        q: number;
        source: 'com_csv' | 'eu_storico';
    };
    const lista: L[] = [];
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
        lista.push({
            ref: orderNumber,
            date: iso,
            priceCents,
            q: quarterOf(iso),
            source: 'com_csv',
        });
    }

    const eu = loadEuOrders2026Dataset();
    for (const o of eu.orders) {
        if (o.alreadyOnCom) continue;
        if (o.incassatoRealeCents <= 0) continue;
        lista.push({
            ref: o.id,
            date: o.date.slice(0, 10),
            priceCents: o.incassatoRealeCents,
            q: o.quarter,
            source: 'eu_storico',
        });
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
    const missing: L[] = [];
    const matchedPairs: Array<{ gw: (typeof gw)[0]; lista: L; how: string }> = [];

    for (const q of [1, 2, 3]) {
        const Lq = lista.filter((l) => l.q === q).map((l) => ({ ...l, used: false }));
        for (const g of gw.filter((x) => x.q === q)) {
            const byRef = Lq.find(
                (l) => !l.used && l.ref.toUpperCase() === g.orderNumber.toUpperCase()
            );
            if (byRef) {
                byRef.used = true;
                matchedPairs.push({ gw: g, lista: byRef, how: 'order_ref' });
                continue;
            }
            // amount + date ±1d
            const byAmtDate = Lq.find((l) => {
                if (l.used || l.priceCents !== Math.abs(g.grossCents)) return false;
                const d =
                    Math.abs(new Date(l.date).getTime() - new Date(g.date).getTime()) / 86400000;
                return d <= 1;
            });
            if (byAmtDate) {
                byAmtDate.used = true;
                matchedPairs.push({ gw: g, lista: byAmtDate, how: 'amount_date' });
                continue;
            }
            const byAmt = Lq.find((l) => !l.used && l.priceCents === Math.abs(g.grossCents));
            if (byAmt) {
                byAmt.used = true;
                matchedPairs.push({ gw: g, lista: byAmt, how: 'amount_only' });
                continue;
            }
            extras.push(g);
        }
        for (const l of Lq) if (!l.used) missing.push(l);
    }

    const enriched = [];
    for (const e of extras) {
        const ord =
            e.orderNumber !== 'DA_COLLEGARE'
                ? await prisma.order.findFirst({
                      where: { orderNumber: e.orderNumber },
                      select: { orderNumber: true, createdAt: true },
                  })
                : null;
        const after = await prisma.order.findMany({
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
            trimestre: `T${e.q}`,
            riferimento: e.orderNumber,
            data: e.date,
            importoEuro: (e.grossCents / 100).toFixed(2),
            gateway: e.gateway,
            transactionId: e.tx,
            ordineCreato: ord?.createdAt?.toISOString().slice(0, 10) || null,
            dopoChiusuraLista10Set: after.map(
                (o) => `${o.orderNumber} (${o.createdAt.toISOString().slice(0, 10)})`
            ),
            classificazione:
                ord && ord.createdAt > new Date('2026-09-10')
                    ? 'ordine registrato dopo chiusura lista operativa (10/09)'
                    : after.length
                      ? 'incasso gateway senza ref lista; esiste ordine stesso importo creato post-chiusura'
                      : 'riga gateway non presente in lista chiusa (né .com CSV né .eu storico)',
        });
    }

    const out = {
        listaRicostruita: {
            n: lista.length,
            euro: (lista.reduce((s, l) => s + l.priceCents, 0) / 100).toFixed(2),
            com: lista.filter((l) => l.source === 'com_csv').length,
            eu: lista.filter((l) => l.source === 'eu_storico').length,
        },
        gateway: {
            n: gw.length,
            euro: (gw.reduce((s, g) => s + g.grossCents, 0) / 100).toFixed(2),
        },
        deltaVsOfficial409868: (
            (gw.reduce((s, g) => s + g.grossCents, 0) - 409868) /
            100
        ).toFixed(2),
        extras,
        enriched,
        missing,
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
            missingN: missing.filter((m) => m.q === q).length,
            missingEuro: (
                missing.filter((m) => m.q === q).reduce((s, m) => s + m.priceCents, 0) / 100
            ).toFixed(2),
        })),
    };
    fs.writeFileSync('/tmp/diag-v3-full.json', JSON.stringify(out, null, 2));
    console.log(JSON.stringify({
        lista: out.listaRicostruita,
        gateway: out.gateway,
        delta: out.deltaVsOfficial409868,
        byQ: out.byQ,
        extras: out.enriched,
        missing: out.missing.map((m) => ({
            q: m.q,
            ref: m.ref,
            date: m.date,
            euro: (m.priceCents / 100).toFixed(2),
            source: m.source,
        })),
    }, null, 2));
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
