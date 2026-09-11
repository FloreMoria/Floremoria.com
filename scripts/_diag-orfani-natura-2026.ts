/**
 * Passo 0 — classifica i 114 orfani 2026 per natura del movimento (sola lettura).
 * Nessuna scrittura DB.
 */
import fs from 'node:fs';
import path from 'node:path';
import prisma from '@/lib/prisma';
import { classifyPaypalGatewayMovement } from '@/lib/financial/paypalClassify';
import { buildGatewayCorrispettivi } from '@/lib/financial/dossierCorrispettiviBuild';
import { measureRevenuePerimeterSets } from '@/lib/financial/revenuePerimeterChannels';

const YEAR = 2026;
const OUT = path.join(
    process.cwd(),
    'docs/verbali/11-09-2026-diag-orfani-natura.json'
);

type Nature =
    | 'pagamento_cliente'
    | 'bonifico_gateway_fineco'
    | 'commissione'
    | 'rimborso'
    | 'movimento_interno'
    | 'duplicato_canali'
    | 'non_classificabile';

function normalizeTxnToken(raw: string): string {
    return raw
        .trim()
        .replace(/^stripe_(?:com|eu)_tx_/i, '')
        .replace(/^stripe_tx_/i, '')
        .replace(/^TX:/i, '')
        .replace(/^PAYPAL_TX:/i, '')
        .replace(/^PAYPAL_FEE:/i, '')
        .replace(/^PAYPAL_PAYOUT:/i, '')
        .replace(/^PAYPAL_REFUND:/i, '');
}

function euro(cents: number): number {
    return Math.round(cents) / 100;
}

async function main() {
    const start = new Date(`${YEAR}-01-01T00:00:00.000Z`);
    const end = new Date(`${YEAR}-12-31T23:59:59.999Z`);

    type Row = {
        key: string;
        gateway: 'stripe' | 'paypal';
        dateIso: string;
        amountCents: number;
        token: string;
        type?: string | null;
        reportingCategory?: string | null;
        description?: string | null;
        sourceKey?: string | null;
        category?: string | null;
        nature: Nature;
        reason: string;
        duplicateOf?: string;
    };

    const rows: Row[] = [];

    const stripeOrphans = await prisma.stripeFinanceMovement.findMany({
        where: {
            orderId: null,
            type: { in: ['charge', 'payment', 'refund', 'payout', 'transfer', 'adjustment'] },
            createdAtStripe: { gte: start, lte: end },
        },
        select: {
            id: true,
            stripeId: true,
            type: true,
            reportingCategory: true,
            createdAtStripe: true,
            amountCents: true,
            feeCents: true,
            netCents: true,
            description: true,
            metadataJson: true,
            payoutId: true,
        },
    });

    // Pool "114" storico: charge/payment > 0 senza orderId (come bridge C12)
    for (const s of stripeOrphans) {
        if (!s.createdAtStripe) continue;
        const typ = (s.type || '').toLowerCase();
        const cat = (s.reportingCategory || '').toLowerCase();
        const desc = s.description || '';
        const token = normalizeTxnToken(s.stripeId || s.id);
        const abs = Math.abs(s.amountCents);
        let nature: Nature = 'non_classificabile';
        let reason = '';

        if (/fee|stripe_fee/i.test(cat) || typ === 'stripe_fee') {
            nature = 'commissione';
            reason = 'reportingCategory/type fee';
        } else if (typ === 'payout' || cat === 'payout' || /payout/i.test(desc)) {
            nature = 'bonifico_gateway_fineco';
            reason = 'stripe payout';
        } else if (typ === 'refund' || cat === 'refund' || s.amountCents < 0 && /refund/i.test(cat + desc)) {
            nature = 'rimborso';
            reason = 'stripe refund';
        } else if (
            /transfer|adjustment|reserve|network_cost|payment_network_reserve/i.test(cat + ' ' + typ) ||
            /minimum_balance|hold|release/i.test(typ)
        ) {
            nature = 'movimento_interno';
            reason = `stripe ${typ}/${cat}`;
        } else if ((typ === 'charge' || typ === 'payment') && s.amountCents > 0) {
            nature = 'pagamento_cliente';
            reason = 'stripe charge/payment >0';
        } else {
            nature = 'non_classificabile';
            reason = `stripe leftover type=${typ} cat=${cat} amt=${s.amountCents}`;
        }

        // Only include in "114 pool" sense for charge/payment>0; keep others for expanded view tagged
        if (nature === 'pagamento_cliente' || nature === 'rimborso' || nature === 'bonifico_gateway_fineco' || nature === 'movimento_interno' || nature === 'commissione') {
            if (nature === 'pagamento_cliente' && s.amountCents <= 0) continue;
            rows.push({
                key: `stripe:${s.stripeId || s.id}`,
                gateway: 'stripe',
                dateIso: s.createdAtStripe.toISOString().slice(0, 10),
                amountCents: abs,
                token,
                type: s.type,
                reportingCategory: s.reportingCategory,
                description: desc,
                nature,
                reason,
            });
        }
    }

    // Restrict stripe pool to same filter as prior diag for payment orphans
    const stripePayOrphans = rows.filter(
        (r) => r.gateway === 'stripe' && r.nature === 'pagamento_cliente'
    );

    const paypalOrphans = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            orderId: null,
            accountingDate: { gte: start, lte: end },
            sourceType: 'PAYPAL_MOVEMENT',
        },
        select: {
            id: true,
            sourceKey: true,
            category: true,
            accountingDate: true,
            totalCents: true,
            description: true,
            counterpartyName: true,
            direction: true,
            metadataJson: true,
        },
    });

    const paypalRows: Row[] = [];
    for (const p of paypalOrphans) {
        const meta = (p.metadataJson || {}) as Record<string, unknown>;
        const desc = p.description || '';
        const sk = p.sourceKey || '';
        const token = normalizeTxnToken(sk);
        const abs = Math.abs(p.totalCents);
        const classified = classifyPaypalGatewayMovement({
            description: desc,
            grossCents: p.totalCents,
            eventCode: typeof meta.eventCode === 'string' ? meta.eventCode : null,
            counterpartyName: p.counterpartyName,
        });

        let nature: Nature = 'non_classificabile';
        let reason = classified.reason || classified.movementKind;

        if (/PAYPAL_FEE:/i.test(sk) || classified.movementKind === 'commissione' || p.category === 'ONERI_BANCARI') {
            nature = 'commissione';
            reason = 'paypal fee';
        } else if (
            /PAYPAL_PAYOUT:/i.test(sk) ||
            classified.movementKind === 'payout' ||
            p.category === 'PAYPAL_PAYOUT' ||
            p.category === 'TRASFERIMENTO_INTERNO'
        ) {
            nature = 'bonifico_gateway_fineco';
            reason = 'paypal payout/transfer';
        } else if (/PAYPAL_REFUND:/i.test(sk) || classified.movementKind === 'rimborso' || p.category === 'RIMBORSI') {
            nature = 'rimborso';
            reason = 'paypal refund';
        } else if (
            classified.isFunding ||
            /ADD TO BALANCE|DENARO RACCOLTO|FONDO|ricarica|SDD|500[,.]00/i.test(desc) ||
            abs === 50000 && /paypal|add to balance|fondi/i.test(desc)
        ) {
            nature = 'movimento_interno';
            reason = classified.isFunding ? 'paypal funding' : `paypal interno: ${desc.slice(0, 80)}`;
        } else if (
            classified.movementKind === 'incasso' ||
            (p.category === 'RICAVI_VENDITE' && p.totalCents > 0)
        ) {
            nature = 'pagamento_cliente';
            reason = 'paypal incasso/ricavo';
        } else if (classified.movementKind === 'skip' || classified.movementKind === 'altro') {
            nature = classified.movementKind === 'skip' ? 'movimento_interno' : 'non_classificabile';
            reason = `${classified.movementKind}:${classified.reason}`;
        } else {
            nature = 'non_classificabile';
            reason = `paypal cat=${p.category} kind=${classified.movementKind}`;
        }

        paypalRows.push({
            key: `paypal:${p.id}`,
            gateway: 'paypal',
            dateIso: p.accountingDate.toISOString().slice(0, 10),
            amountCents: abs,
            token,
            description: desc,
            sourceKey: sk,
            category: p.category,
            nature,
            reason,
        });
    }

    // Pool allineato al bridge: stripe charge orphans + paypal RICAVI orphans >0
    const pool: Row[] = [
        ...stripePayOrphans,
        ...paypalRows.filter((r) => r.nature === 'pagamento_cliente' && r.amountCents > 0),
    ];

    // Detect channel duplicates within pool (same token, different key prefixes / gateways)
    const byToken = new Map<string, Row[]>();
    for (const r of pool) {
        if (!r.token || r.token.length < 8) continue;
        const list = byToken.get(r.token) || [];
        list.push(r);
        byToken.set(r.token, list);
    }

    // Also duplicate across stripe_eu vs stripe_com ids differing only by prefix — already same token after normalize
    let dupMarked = 0;
    for (const [, list] of byToken) {
        if (list.length < 2) continue;
        // Prefer keep one pagamento_cliente; mark others as duplicato
        const sorted = [...list].sort((a, b) => a.key.localeCompare(b.key));
        const keep = sorted[0]!;
        for (const other of sorted.slice(1)) {
            if (other.nature === 'duplicato_canali') continue;
            other.nature = 'duplicato_canali';
            other.reason = `dup token ${other.token} of ${keep.key}`;
            other.duplicateOf = keep.key;
            dupMarked += 1;
        }
    }

    // Cross-check: stripe_eu and bare txn in store both as orphans with same token
    // (already handled)

    // Expanded inventory (all natures) for context — stripe non-payment + all paypal
    const expanded: Row[] = [
        ...rows.filter((r) => r.nature !== 'pagamento_cliente'),
        ...stripePayOrphans,
        ...paypalRows,
    ];
    // re-apply dup mark on expanded payments sharing token
    const expPay = expanded.filter((r) => r.nature === 'pagamento_cliente');
    const expByTok = new Map<string, Row[]>();
    for (const r of expPay) {
        if (!r.token || r.token.length < 8) continue;
        const list = expByTok.get(r.token) || [];
        list.push(r);
        expByTok.set(r.token, list);
    }
    for (const [, list] of expByTok) {
        if (list.length < 2) continue;
        const sorted = [...list].sort((a, b) => a.key.localeCompare(b.key));
        const keep = sorted[0]!;
        for (const other of sorted.slice(1)) {
            other.nature = 'duplicato_canali';
            other.reason = `dup token ${other.token} of ${keep.key}`;
            other.duplicateOf = keep.key;
        }
    }

    const summarize = (list: Row[]) => {
        const cats: Nature[] = [
            'pagamento_cliente',
            'bonifico_gateway_fineco',
            'commissione',
            'rimborso',
            'movimento_interno',
            'duplicato_canali',
            'non_classificabile',
        ];
        const out: Record<string, { n: number; euro: number; samples: Array<{ key: string; euro: number; reason: string; date: string }> }> = {};
        for (const c of cats) {
            const subset = list.filter((r) => r.nature === c);
            out[c] = {
                n: subset.length,
                euro: euro(subset.reduce((s, r) => s + r.amountCents, 0)),
                samples: subset.slice(0, 8).map((r) => ({
                    key: r.key,
                    euro: euro(r.amountCents),
                    reason: r.reason,
                    date: r.dateIso,
                })),
            };
        }
        return out;
    };

    const poolSummary = summarize(pool);
    const payClient = pool.filter((r) => r.nature === 'pagamento_cliente');
    const payClientEuro = euro(payClient.reduce((s, r) => s + r.amountCents, 0));

    const sets = await measureRevenuePerimeterSets(YEAR);
    const corr = sets.find((s) => s.id === 'corrispettivi')!;
    const trio = sets.find((s) => s.id === 'taxRegister')!;
    const sumOrders = async (ids: string[]) => {
        const orders = await prisma.order.findMany({
            where: { id: { in: ids } },
            select: { grossAmount: true, totalPriceCents: true },
        });
        let c = 0;
        for (const o of orders) {
            c += o.grossAmount != null ? Math.round(Number(o.grossAmount) * 100) : o.totalPriceCents;
        }
        return euro(c);
    };
    const corrEuro = await sumOrders(corr.orderIds);
    const trioEuro = await sumOrders(trio.orderIds);
    const linkedPlusOrphanPay = Math.round((corrEuro + payClientEuro) * 100) / 100;
    const deltaVsTrio = Math.round((linkedPlusOrphanPay - trioEuro) * 100) / 100;

    // Also sum gateway corrispettivi gross (may differ from order gross)
    const gw = await buildGatewayCorrispettivi({ start, end });
    const gwLinked = gw.rows.filter((r) => r.orderId);
    const gwOrphan = gw.rows.filter((r) => !r.orderId);
    const gwLinkedEuro = euro(gwLinked.reduce((s, r) => s + Math.abs(r.grossCents), 0));
    const gwOrphanEuro = euro(gwOrphan.reduce((s, r) => s + Math.abs(r.grossCents), 0));

    // Fees by quarter 2026 (all, not only orphans)
    const feeStripe = await prisma.stripeFinanceMovement.findMany({
        where: {
            feeCents: { gt: 0 },
            createdAtStripe: { gte: start, lte: end },
        },
        select: { feeCents: true, createdAtStripe: true, type: true, orderId: true },
    });
    const feePaypal = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            accountingDate: { gte: start, lte: end },
            OR: [{ sourceKey: { startsWith: 'PAYPAL_FEE:' } }, { category: 'ONERI_BANCARI', sourceType: 'PAYPAL_MOVEMENT' }],
        },
        select: { totalCents: true, accountingDate: true, sourceKey: true },
    });

    const qOf = (d: Date) => Math.floor(d.getUTCMonth() / 3) + 1;
    const feesByQ: Record<string, { stripeN: number; stripeEuro: number; paypalN: number; paypalEuro: number }> = {};
    for (let q = 1; q <= 4; q++) {
        feesByQ[`T${q}`] = { stripeN: 0, stripeEuro: 0, paypalN: 0, paypalEuro: 0 };
    }
    for (const m of feeStripe) {
        if (!m.createdAtStripe) continue;
        const q = `T${qOf(m.createdAtStripe)}`;
        feesByQ[q]!.stripeN += 1;
        feesByQ[q]!.stripeEuro += m.feeCents;
    }
    for (const m of feePaypal) {
        const q = `T${qOf(m.accountingDate)}`;
        feesByQ[q]!.paypalN += 1;
        feesByQ[q]!.paypalEuro += Math.abs(m.totalCents);
    }
    for (const q of Object.keys(feesByQ)) {
        feesByQ[q]!.stripeEuro = euro(feesByQ[q]!.stripeEuro);
        feesByQ[q]!.paypalEuro = euro(feesByQ[q]!.paypalEuro);
    }

    // Fund 500 detection
    const fund500 = paypalRows.filter(
        (r) => r.amountCents === 50000 || /500[,.]00|fondo|add to balance/i.test(r.description || '')
    );

    const report = {
        generatedAt: new Date().toISOString(),
        year: YEAR,
        note: 'Pool allineato al bridge C12: stripe charge/payment orderId=null + paypal ricavi orderId=null. Classificazione per natura; duplicati = stesso token TX.',
        pool: {
            n: pool.length,
            euro: euro(pool.reduce((s, r) => s + r.amountCents, 0)),
            byNature: poolSummary,
            dupMarked,
        },
        compatibility: {
            corrOrdersEuro: corrEuro,
            orphanPagamentoClienteEuro: payClientEuro,
            sum: linkedPlusOrphanPay,
            trioFatturatoLordoEuro: trioEuro,
            deltaSumMinusTrio: deltaVsTrio,
            interpretation:
                deltaVsTrio > 50
                    ? 'Somma > fatturato: residuo = pagamenti orfani non nel trio (altri anni/canali), duplicati non rimossi, o gross gateway ≠ gross ordine'
                    : deltaVsTrio < -50
                      ? 'Somma < fatturato: mancano pagamenti cliente ancora fuori dal pool orfani (già in corrispettivi solo come ordine, o non in store)'
                      : 'Compatibile (±50€)',
            gwCorrispettivi: {
                linkedN: gwLinked.length,
                linkedEuro: gwLinkedEuro,
                orphanRowsN: gwOrphan.length,
                orphanRowsEuro: gwOrphanEuro,
            },
        },
        fund500Samples: fund500.slice(0, 10),
        feesByQuarter2026: feesByQ,
        feesTotalEuro: {
            stripe: Object.values(feesByQ).reduce((s, x) => s + x.stripeEuro, 0),
            paypal: Object.values(feesByQ).reduce((s, x) => s + x.paypalEuro, 0),
        },
        poolRows: pool.map((r) => ({
            key: r.key,
            gateway: r.gateway,
            date: r.dateIso,
            euro: euro(r.amountCents),
            nature: r.nature,
            reason: r.reason,
            duplicateOf: r.duplicateOf,
            token: r.token,
        })),
    };

    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(
        JSON.stringify(
            {
                poolN: report.pool.n,
                poolEuro: report.pool.euro,
                byNature: Object.fromEntries(
                    Object.entries(report.pool.byNature).map(([k, v]) => [k, { n: v.n, euro: v.euro }])
                ),
                compatibility: report.compatibility,
                feesByQuarter2026: report.feesByQuarter2026,
                feesTotalEuro: report.feesTotalEuro,
                out: OUT,
            },
            null,
            2
        )
    );
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
