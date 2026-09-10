/**
 * READ-ONLY — simulazione match gateway ↔ dataset .eu 2026 + impatto MANCANTE.
 * Nessuna scrittura DB.
 *
 * Uso: npx tsx scripts/simulate-eu-gateway-match-readonly-2026.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();
if (process.env.DATABASE_URL_UNPOOLED) {
    process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
}

import fs from 'fs';
import path from 'path';
import prisma from '@/lib/prisma';
import { buildGatewayCorrispettivi } from '@/lib/financial/dossierCorrispettiviBuild';
import {
    loadEuOrders2026Dataset,
    matchGatewaysToEuOrders,
} from '@/lib/financial/euOrders2026Match';
import { classifyPaypalGatewayMovement } from '@/lib/financial/paypalClassify';
import { parsePaypalSourceKey } from '@/lib/financial/paypalSourceKeys';

/** Baseline documentata (09/09 + pre-fixture) — prima del match dataset .eu. */
const PRE_MATCH: Record<1 | 2 | 3, number> = {
    1: 0.38,
    2: 0.567,
    3: 0.498,
};

function quarterBounds(q: 1 | 2 | 3) {
    const startMonth = (q - 1) * 3;
    return {
        start: new Date(Date.UTC(2026, startMonth, 1, 0, 0, 0)),
        end: new Date(Date.UTC(2026, startMonth + 3, 0, 23, 59, 59, 999)),
    };
}

async function loadProbes(start: Date, end: Date) {
    const [stripe, paypal] = await Promise.all([
        prisma.stripeFinanceMovement.findMany({
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
                metadataJson: true,
            },
            take: 8000,
        }),
        prisma.financialLedgerEntry.findMany({
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
                direction: true,
            },
            take: 5000,
        }),
    ]);

    const probes: Array<{
        key: string;
        gateway: string;
        paymentDateIso: string;
        grossCents: number;
        payerName: string | null;
        email: string | null;
        orderId: string | null;
        isEuTag: boolean;
    }> = [];

    for (const r of stripe) {
        const t = (r.type || '').toLowerCase();
        const isRefund = t.includes('refund');
        let gross = r.amountCents;
        if (!isRefund && gross < 0) gross = Math.abs(gross);
        if (isRefund && gross > 0) gross = -gross;
        if (gross === 0) continue;
        if (/fee|payout|transfer|adjustment/i.test(r.reportingCategory || '')) continue;
        const txId = (r.sourceId || r.stripeId || '').trim();
        if (!txId) continue;
        const meta = (r.metadataJson || {}) as Record<string, unknown>;
        probes.push({
            key: `stripe:${txId}`.toLowerCase(),
            gateway: 'Stripe',
            paymentDateIso: r.createdAtStripe.toISOString().slice(0, 10),
            grossCents: gross,
            payerName:
                (typeof meta.customerName === 'string' && meta.customerName) ||
                (typeof meta.payerName === 'string' && meta.payerName) ||
                null,
            email:
                (typeof meta.receipt_email === 'string' && meta.receipt_email) ||
                (typeof meta.customerEmail === 'string' && meta.customerEmail) ||
                null,
            orderId: r.orderId,
            isEuTag: /stripe_eu/i.test(r.stripeId) || meta.account === 'EU',
        });
    }

    for (const r of paypal) {
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
        else if (r.direction === 'USCITA' && classified.movementKind === 'incasso') continue;
        if (gross === 0) continue;
        const parsed = parsePaypalSourceKey(r.sourceKey);
        const txId =
            (typeof meta.transactionId === 'string' && meta.transactionId) ||
            parsed?.transactionId ||
            r.sourceKey.replace(/^PAYPAL_/, '');
        probes.push({
            key: `paypal:${txId}`.toLowerCase(),
            gateway: 'PayPal',
            paymentDateIso: (r.accountingDate || new Date()).toISOString().slice(0, 10),
            grossCents: gross,
            payerName:
                (typeof meta.counterpartyName === 'string' && meta.counterpartyName) || null,
            email: (typeof meta.payerEmail === 'string' && meta.payerEmail) || null,
            orderId: r.orderId,
            isEuTag: false,
        });
    }

    return probes;
}

async function main() {
    const ds = loadEuOrders2026Dataset();
    const allMatches: Array<Record<string, unknown>> = [];
    const quarters: Array<Record<string, unknown>> = [];

    for (const q of [1, 2, 3] as const) {
        const { start, end } = quarterBounds(q);
        const probes = await loadProbes(start, end);
        const qOrders = ds.orders.filter((o) => o.quarter === q);
        const matches = matchGatewaysToEuOrders(
            probes.map((p) => ({
                key: p.key,
                paymentDateIso: p.paymentDateIso,
                grossCents: p.grossCents,
                payerName: p.payerName,
                email: p.email,
            })),
            qOrders,
            3
        );

        for (const m of matches) {
            const gw = probes.find((p) => p.key === m.gatewayKey)!;
            allMatches.push({
                quarter: q,
                dateOrder: m.order.date,
                dateGw: gw.paymentDateIso,
                customer: m.order.customerName || m.order.email,
                canale: m.order.canale,
                listinoEuro: m.order.listinoEuro,
                scontoEuro: m.order.scontoEuro,
                incassatoRealeEuro: m.order.incassatoRealeEuro,
                gatewayGrossEuro: gw.grossCents / 100,
                gateway: gw.gateway,
                score: m.score,
                daysDelta: m.daysDelta,
                amountDeltaCents: m.listMinusGatewayCents,
                alreadyLinkedOrderId: gw.orderId,
                isEuTag: gw.isEuTag,
                note: m.order.note,
            });
        }

        const built = await buildGatewayCorrispettivi({ start, end });
        const post = built.totals.mancanteShare;
        const pre = PRE_MATCH[q];
        quarters.push({
            quarter: `T${q} 2026`,
            euOrdersInFixture: qOrders.length,
            gatewayProbes: probes.length,
            matches: matches.length,
            matchedIncassatoEuro: Number(
                (
                    matches.reduce((s, m) => s + m.order.incassatoRealeCents, 0) / 100
                ).toFixed(2)
            ),
            mancantePrePct: Number((pre * 100).toFixed(1)),
            mancantePostPct: Number((post * 100).toFixed(1)),
            under30Gate: post <= 0.3,
            buildTotals: {
                grossEuro: Number((built.totals.grossAllCents / 100).toFixed(2)),
                determinataEuro: Number((built.totals.determinataGrossCents / 100).toFixed(2)),
                presuntaEuro: Number((built.totals.presuntaGrossCents / 100).toFixed(2)),
                mancanteEuro: Number((built.totals.mancanteGrossCents / 100).toFixed(2)),
            },
        });
    }

    const report = {
        generatedAt: new Date().toISOString(),
        dbWrites: false,
        fixture: {
            path: 'scripts/data/floremoria-eu-orders-2026.json',
            orderCount: ds.meta.orderCount,
            countsByQuarter: ds.meta.countsByQuarter,
            totalIncassatoRealeEuro: ds.meta.totalIncassatoRealeEuro,
            totalListinoEuro: ds.meta.totalListinoEuro,
        },
        finecoPaste: {
            confirmFinecoPaste: 'riabilitata (periodo aperto)',
            guardrailSaldo: 'isFinecoSaldoOrHeaderLine attivo',
            stato: 'PROVVISORIO fino a estratto ufficiale metà ottobre',
        },
        quarters,
        matches: allMatches,
        exportGate: {
            anyQuarterUnder30: quarters.some((q) => q.under30Gate === true),
            allT1T3Under30: quarters.every((q) => q.under30Gate === true),
        },
    };

    const outJson = path.join(
        process.cwd(),
        'docs/verbali/10-09-2026-eu-gateway-match-readonly.json'
    );
    const outMd = path.join(process.cwd(), 'docs/verbali/10-09-2026-eu-gateway-match-readonly.md');
    fs.writeFileSync(outJson, JSON.stringify(report, null, 2) + '\n');

    const md: string[] = [
        '# Simulazione match .eu ↔ gateway (sola lettura)',
        '',
        `**Generato:** ${report.generatedAt}`,
        '**Scritture DB:** nessuna',
        '',
        '## Fixture',
        '',
        `| Voce | Valore |`,
        `|---|---|`,
        `| Ordini | **${ds.meta.orderCount}** (T1 ${ds.meta.countsByQuarter?.[1] ?? '?'} · T2 ${ds.meta.countsByQuarter?.[2] ?? '?'} · T3 ${ds.meta.countsByQuarter?.[3] ?? '?'}) |`,
        `| Totale listino | € ${ds.meta.totalListinoEuro} |`,
        `| Totale incassato reale | € ${ds.meta.totalIncassatoRealeEuro} |`,
        `| Isabella Cesaroni | Listino €299,90 · Sconto €15,00 · Incassato €284,90 (Diretto) |`,
        `| Amanda Favot | Incassato €39,98 (Partner) |`,
        `| Oreste Poverello | €89,99 (Partner) |`,
        `| Nicolato Francesco | €104,98 (Diretto) |`,
        '',
        '## MANCANTE pre vs post',
        '',
        '| Trimestre | Pre-match | Post-match | Sotto 30%? | Match .eu |',
        '|---|---:|---:|:---:|---:|',
    ];
    for (const q of quarters) {
        md.push(
            `| ${q.quarter} | ${q.mancantePrePct}% | **${q.mancantePostPct}%** | ${q.under30Gate ? 'SÌ' : 'NO'} | ${q.matches} |`
        );
    }
    md.push(
        '',
        `**Export dossier valido (tutti T1–T3 ≤30%):** ${report.exportGate.allT1T3Under30 ? 'SÌ' : 'NO'}`,
        '',
        '## Match (estratto)',
        '',
        '| Q | Data ord. | Cliente | Incassato | GW € | Score | Δgg |',
        '|---|---|---|---:|---:|---|---:|'
    );
    for (const m of allMatches.slice(0, 50)) {
        md.push(
            `| T${m.quarter} | ${m.dateOrder} | ${(m.customer as string).slice(0, 28)} | ${m.incassatoRealeEuro} | ${m.gatewayGrossEuro} | ${m.score} | ${m.daysDelta} |`
        );
    }
    if (allMatches.length > 50) md.push(`| … | ${allMatches.length - 50} altri | | | | | |`);
    md.push(
        '',
        '## Fineco paste',
        '',
        '- `confirmFinecoPaste` resta riabilitata sul periodo aperto.',
        '- Guardrail: esclusione saldi (`Saldo disponibile/iniziale/contabile`).',
        '- Stato **PROVVISORIO** fino a upload estratto ufficiale (metà ottobre).',
        ''
    );
    fs.writeFileSync(outMd, md.join('\n'));

    console.log(JSON.stringify({ quarters, matchCount: allMatches.length, exportGate: report.exportGate }, null, 2));
    console.log(`Wrote ${outMd}`);
    await prisma.$disconnect();
}

main().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
