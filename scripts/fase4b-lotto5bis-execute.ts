/**
 * Fase 4b — Lotto 5-bis: funding Fineco→PayPal €500 ancora in SPESE_OPERATIVE.
 *
 * Atteso: ΔRAI +€500; banca invariata; PayPal transit −€1.093,01 → −€593,01.
 * Uso: npx tsx scripts/fase4b-lotto5bis-execute.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();
if (process.env.DATABASE_URL_UNPOOLED) {
    process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
}

import { writeFileSync } from 'fs';
import { join } from 'path';
import type { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { computeHistoricalPnl } from '../lib/financial/historicalLedgerQuery';
import { compareGatewayTransitBalances } from '../lib/financial/gatewayTransitBalance';
import {
    ACCOUNT_BANCA_FINECO,
    ACCOUNT_BANCA_CO_PAYPAL,
} from '../lib/financial/chartOfAccounts';

function euro(cents: number) {
    return (cents / 100).toLocaleString('it-IT', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
    });
}
function asMeta(m: unknown): Record<string, unknown> {
    return m && typeof m === 'object' && !Array.isArray(m) ? (m as Record<string, unknown>) : {};
}
function batchIdNow() {
    const d = new Date();
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    return `FASE4B_L5BIS_${y}${m}${day}_${hh}${mm}${ss}`;
}

const EXPECTED_RAI_PRE = -430_448;
const EXPECTED_RAI_POST = -380_448;
const EXPECTED_DELTA = 50_000;
const EXPECTED_PP_PRE = -109_301;
const EXPECTED_PP_POST = -59_301;
const TOL = 5;

type Snap = {
    at: string;
    costiTotCents: number;
    raiCents: number;
    cashBankCents: number;
    ivaDebitoCents: number;
    ivaCreditoCents: number;
    activeCount: number;
    paypalTransitCents: number;
    stripeTransitCents: number;
};

async function snapshot(): Promise<Snap> {
    const p = await computeHistoricalPnl({ fiscalYear: 2026 });
    const costiTotCents =
        p.costiFioristiCents +
        p.costiFatturePassiveSdiCents +
        p.costiSaasCents +
        p.costiOperativiCents +
        p.oneriBancariCents;
    const activeCount = await prisma.financialLedgerEntry.count({
        where: { reversedAt: null, fiscalYear: 2026 },
    });
    const transit = await compareGatewayTransitBalances();
    return {
        at: new Date().toISOString(),
        costiTotCents,
        raiCents: p.risultatoAnteImposteCents,
        cashBankCents: p.cashBankBalanceCents,
        ivaDebitoCents: p.ivaDebitoCents,
        ivaCreditoCents: p.ivaCreditoCents,
        activeCount,
        paypalTransitCents: transit.paypal.transitLedgerCents,
        stripeTransitCents: transit.stripe.transitLedgerCents,
    };
}

async function main() {
    const batchId = batchIdNow();
    const pre = await snapshot();
    console.log(JSON.stringify({ phase: 'pre', batchId, ...Object.fromEntries(
        Object.entries(pre).map(([k, v]) => [k, typeof v === 'number' && k.includes('Cents') || k.includes('Count') ? v : typeof v === 'number' ? euro(v) : v])
    ), rai: euro(pre.raiCents), costi: euro(pre.costiTotCents), banca: euro(pre.cashBankCents), paypal: euro(pre.paypalTransitCents) }, null, 2));

    if (Math.abs(pre.raiCents - EXPECTED_RAI_PRE) > TOL) {
        throw new Error(`RAI pre ${pre.raiCents} ≠ ${EXPECTED_RAI_PRE}`);
    }
    if (Math.abs(pre.paypalTransitCents - EXPECTED_PP_PRE) > TOL) {
        throw new Error(`PayPal transit pre ${pre.paypalTransitCents} ≠ ${EXPECTED_PP_PRE}`);
    }

    const targets = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            fiscalYear: 2026,
            sourceType: 'BANK_LINE',
            category: { not: 'TRASFERIMENTO_INTERNO' },
            totalCents: { in: [-50_000, 50_000] },
            description: { contains: 'PayPal', mode: 'insensitive' },
        },
        select: {
            id: true,
            category: true,
            totalCents: true,
            description: true,
            accountingDate: true,
            metadataJson: true,
        },
    });
    // Solo uscite ancora in costo
    const funding = targets.filter(
        (t) =>
            t.totalCents < 0 &&
            ['SPESE_OPERATIVE', 'SPESE_SAAS', 'ALTRI_COSTI', 'COSTI_FIORISTI', 'ONERI_BANCARI'].includes(
                t.category
            )
    );
    if (funding.length !== 1 || Math.abs(funding[0].totalCents) !== 50_000) {
        throw new Error(`Expected 1×€500 funding in cost, got ${JSON.stringify(funding)}`);
    }

    // Preflight
    const overrides = new Map([[funding[0].id, 'TRASFERIMENTO_INTERNO']]);
    const sim = await computeHistoricalPnl({ fiscalYear: 2026, categoryOverrides: overrides });
    if (Math.abs(sim.risultatoAnteImposteCents - EXPECTED_RAI_POST) > TOL) {
        throw new Error(`Preflight RAI ${sim.risultatoAnteImposteCents} ≠ ${EXPECTED_RAI_POST}`);
    }

    const executedAt = new Date().toISOString();
    const prev = asMeta(funding[0].metadataJson);
    await prisma.financialLedgerEntry.update({
        where: { id: funding[0].id },
        data: {
            category: 'TRASFERIMENTO_INTERNO',
            entryNature: 'TRANSITO',
            metadataJson: {
                ...prev,
                dareAccount: ACCOUNT_BANCA_CO_PAYPAL,
                avereAccount: ACCOUNT_BANCA_FINECO,
                fase4bBatchId: batchId,
                fase4bLotto: '5bis',
                fase4bAction: 'RECLASS_FUNDING_TO_TRANSIT',
                fase4bPrevCategory: funding[0].category,
                fase4bExecutedAt: executedAt,
            } as Prisma.InputJsonValue,
        },
    });

    const post = await snapshot();
    const bankOk = post.cashBankCents === pre.cashBankCents;
    const raiOk = Math.abs(post.raiCents - EXPECTED_RAI_POST) <= TOL;
    const ppOk = Math.abs(post.paypalTransitCents - EXPECTED_PP_POST) <= TOL;

    const out = {
        generatedAt: new Date().toISOString(),
        batchId,
        targetId: funding[0].id,
        acceptance: { raiOk, bankOk, ppOk, deltaAtteso: euro(EXPECTED_DELTA) },
        pre: {
            rai: euro(pre.raiCents),
            costi: euro(pre.costiTotCents),
            banca: euro(pre.cashBankCents),
            ivaD: euro(pre.ivaDebitoCents),
            ivaC: euro(pre.ivaCreditoCents),
            attive: pre.activeCount,
            stripe: euro(pre.stripeTransitCents),
            paypal: euro(pre.paypalTransitCents),
            paypalCents: pre.paypalTransitCents,
        },
        post: {
            rai: euro(post.raiCents),
            costi: euro(post.costiTotCents),
            banca: euro(post.cashBankCents),
            ivaD: euro(post.ivaDebitoCents),
            ivaC: euro(post.ivaCreditoCents),
            attive: post.activeCount,
            stripe: euro(post.stripeTransitCents),
            paypal: euro(post.paypalTransitCents),
            paypalCents: post.paypalTransitCents,
        },
        delta: {
            rai: euro(post.raiCents - pre.raiCents),
            costi: euro(post.costiTotCents - pre.costiTotCents),
            banca: euro(post.cashBankCents - pre.cashBankCents),
            paypal: euro(post.paypalTransitCents - pre.paypalTransitCents),
        },
    };

    if (!bankOk || !raiOk || !ppOk) {
        console.error(JSON.stringify({ FAIL: out }, null, 2));
        throw new Error(`Acceptance fail bankOk=${bankOk} raiOk=${raiOk} ppOk=${ppOk}`);
    }

    const base = join(process.cwd(), 'docs/verbali');
    const md = `# Fase 4b — Lotto 5-bis ESEGUITO (funding €500)

**Eseguito:** ${out.generatedAt}  
**batch_id:** \`${batchId}\`  
**Target:** \`${funding[0].id}\`

| | PRE | POST | Δ |
|--|-----|------|---|
| RAI | ${out.pre.rai} | ${out.post.rai} | ${out.delta.rai} |
| Costi | ${out.pre.costi} | ${out.post.costi} | ${out.delta.costi} |
| Banca | ${out.pre.banca} | ${out.post.banca} | ${out.delta.banca} |
| IVA D/C | ${out.pre.ivaD} / ${out.pre.ivaC} | ${out.post.ivaD} / ${out.post.ivaC} | — |
| Attive | ${out.pre.attive} | ${out.post.attive} | — |
| Stripe transit | ${out.pre.stripe} | ${out.post.stripe} | — |
| **PayPal transit** | **${out.pre.paypal}** | **${out.post.paypal}** | **${out.delta.paypal}** |
`;
    writeFileSync(join(base, 'dossier_fase4b_lotto5bis_eseguito.json'), JSON.stringify(out, null, 2));
    writeFileSync(join(base, 'dossier_fase4b_lotto5bis_eseguito.md'), md);

    const freeze = {
        label: 'FREEZE_UFFICIALE_POST_LOTTO5BIS',
        at: post.at,
        batchId,
        raiCents: post.raiCents,
        costiTotCents: post.costiTotCents,
        cashBankCents: post.cashBankCents,
        paypalTransitCents: post.paypalTransitCents,
        stripeTransitCents: post.stripeTransitCents,
        euro: {
            rai: out.post.rai,
            costi: out.post.costi,
            banca: out.post.banca,
            paypal: out.post.paypal,
            stripe: out.post.stripe,
        },
    };
    writeFileSync(join(base, 'dossier_fase4b_freeze_post_lotto5bis.json'), JSON.stringify(freeze, null, 2));
    writeFileSync(
        join(base, 'dossier_fase4b_freeze_post_lotto5bis.md'),
        `# Freeze post-Lotto 5-bis\n\n**Label:** \`FREEZE_UFFICIALE_POST_LOTTO5BIS\` · \`${batchId}\`\n\n| | |\n|--|--|\n| RAI | ${freeze.euro.rai} |\n| Costi | ${freeze.euro.costi} |\n| Banca | ${freeze.euro.banca} |\n| PayPal transit | ${freeze.euro.paypal} |\n| Stripe transit | ${freeze.euro.stripe} |\n`
    );

    console.log(JSON.stringify({ phase: 'done', ...out.acceptance, delta: out.delta, paypalPost: out.post.paypal }, null, 2));
}

main()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
