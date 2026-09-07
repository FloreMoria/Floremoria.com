/**
 * Fase 4b — Lotto 5 ESECUZIONE: SDD Fineco→PayPal da costo a TRASFERIMENTO_INTERNO.
 *
 * Acceptance (socio): RAI −€5.418,51 → −€4.304,48 (+€1.114,03); banca INVARIATA.
 * PayPal transit deve avvicinarsi a zero (modello a tre gambe).
 *
 * Uso: DATABASE_URL=$DATABASE_URL_UNPOOLED npx tsx scripts/fase4b-lotto5-execute.ts
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
import { applyFiscalAuthorityHierarchy } from '../lib/financial/fiscalAuthorityDedupe';
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
function dayKey(d: Date) {
    return d.toISOString().slice(0, 10);
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
    return `FASE4B_L5_${y}${m}${day}_${hh}${mm}${ss}`;
}

const SDD_RE = /\b(sdd|sepa\s*direct|addebito\s*sdd|paypal\s*europe|preautorizzato)\b/i;

const EXPECTED_DELTA_RAI = 111_403; // €1.114,03
const EXPECTED_RAI_POST = -430_448; // −€4.304,48
const EXPECTED_RAI_PRE = -541_851; // −€5.418,51
const TOLERANCE_CENTS = 5;

type Snap = {
    at: string;
    costiTotCents: number;
    raiCents: number;
    ivaDebitoCents: number;
    ivaCreditoCents: number;
    cashBankCents: number;
    activeCount: number;
    venditeCents: number;
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
        ivaDebitoCents: p.ivaDebitoCents,
        ivaCreditoCents: p.ivaCreditoCents,
        cashBankCents: p.cashBankBalanceCents,
        activeCount,
        venditeCents: p.venditeCaratteristicheCents ?? 0,
        paypalTransitCents: transit.paypal.transitLedgerCents,
        stripeTransitCents: transit.stripe.transitLedgerCents,
    };
}

/**
 * Perimetro ufficiale freeze post-L4: SDD unici (giorno+importo) ancora nel CE
 * dopo gerarchia — indipendentemente dalla category etichetta (molti sono
 * RICAVI_VENDITE con totalCents negativo e colpiscono comunque i costi).
 * Funding €500 Fineco→PayPal resta fuori: ΔRAI dichiarato è +€1.114,03 senza di esso.
 */
async function selectTargets() {
    const all = await prisma.financialLedgerEntry.findMany({
        where: { reversedAt: null, fiscalYear: 2026 },
        select: {
            id: true,
            sourceType: true,
            sourceId: true,
            sourceKey: true,
            orderId: true,
            documentRef: true,
            accountingDate: true,
            totalCents: true,
            direction: true,
            category: true,
            bankLineId: true,
            description: true,
            counterpartyName: true,
            attachmentUrl: true,
            metadataJson: true,
        },
    });
    const usable = applyFiscalAuthorityHierarchy(all);
    const bankOut = all.filter(
        (r) => r.sourceType === 'BANK_LINE' && (r.direction === 'USCITA' || r.totalCents < 0)
    );
    const sdd = bankOut.filter((r) => SDD_RE.test(r.description || ''));
    const uniqMap = new Map<string, (typeof sdd)[0]>();
    for (const r of sdd) {
        const k = `${dayKey(r.accountingDate)}|${Math.abs(r.totalCents)}`;
        if (!uniqMap.has(k)) uniqMap.set(k, r);
    }
    const uniqIds = new Set([...uniqMap.values()].map((u) => u.id));

    const targets: typeof usable = [];
    for (const r of usable) {
        if (!uniqIds.has(r.id)) continue;
        if (r.category === 'TRASFERIMENTO_INTERNO' || r.category === 'PAYPAL_PAYOUT') continue;
        targets.push(r);
    }
    return targets;
}

async function main() {
    const batchId = batchIdNow();
    console.log(JSON.stringify({ phase: 'start', batchId }, null, 2));

    const pre = await snapshot();
    console.log(
        JSON.stringify(
            {
                phase: 'snapshot_pre',
                rai: euro(pre.raiCents),
                costi: euro(pre.costiTotCents),
                banca: euro(pre.cashBankCents),
                ivaD: euro(pre.ivaDebitoCents),
                ivaC: euro(pre.ivaCreditoCents),
                attive: pre.activeCount,
                stripeTransit: euro(pre.stripeTransitCents),
                paypalTransit: euro(pre.paypalTransitCents),
            },
            null,
            2
        )
    );

    if (Math.abs(pre.raiCents - EXPECTED_RAI_PRE) > TOLERANCE_CENTS) {
        throw new Error(
            `RAI pre fuori freeze: got ${pre.raiCents}, expected ~${EXPECTED_RAI_PRE}. STOP.`
        );
    }

    const targets = await selectTargets();
    const hitCents = targets.reduce((s, t) => s + Math.abs(t.totalCents), 0);
    console.log(
        JSON.stringify(
            {
                phase: 'targets',
                n: targets.length,
                hitEuro: euro(hitCents),
                sample: targets.slice(0, 8).map((t) => ({
                    id: t.id,
                    date: dayKey(t.accountingDate),
                    cat: t.category,
                    amt: euro(t.totalCents),
                    desc: (t.description || '').slice(0, 80),
                })),
            },
            null,
            2
        )
    );

    // Preflight con override (sola lettura)
    const overrides = new Map(targets.map((t) => [t.id, 'TRASFERIMENTO_INTERNO']));
    const sim = await computeHistoricalPnl({ fiscalYear: 2026, categoryOverrides: overrides });
    const deltaSim = sim.risultatoAnteImposteCents - pre.raiCents;
    if (Math.abs(deltaSim - EXPECTED_DELTA_RAI) > TOLERANCE_CENTS) {
        throw new Error(
            `Preflight ΔRAI ${deltaSim} ≠ atteso ${EXPECTED_DELTA_RAI}. STOP senza write.`
        );
    }
    if (Math.abs(sim.risultatoAnteImposteCents - EXPECTED_RAI_POST) > TOLERANCE_CENTS) {
        throw new Error(
            `Preflight RAI post ${sim.risultatoAnteImposteCents} ≠ ${EXPECTED_RAI_POST}. STOP.`
        );
    }

    const executedAt = new Date().toISOString();
    let n = 0;
    for (const t of targets) {
        const prev = asMeta(t.metadataJson);
        await prisma.financialLedgerEntry.update({
            where: { id: t.id },
            data: {
                category: 'TRASFERIMENTO_INTERNO',
                entryNature: 'TRANSITO',
                metadataJson: {
                    ...prev,
                    // Funding Fineco → wallet PayPal: Dare PayPal / Avere Fineco
                    dareAccount: ACCOUNT_BANCA_CO_PAYPAL,
                    avereAccount: ACCOUNT_BANCA_FINECO,
                    fase4bBatchId: batchId,
                    fase4bLotto: 5,
                    fase4bAction: 'RECLASS_SDD_TO_TRANSIT',
                    fase4bPrevCategory: t.category,
                    fase4bPrevDareAccount: prev.dareAccount ?? null,
                    fase4bPrevAvereAccount: prev.avereAccount ?? null,
                    fase4bExecutedAt: executedAt,
                } as Prisma.InputJsonValue,
            },
        });
        n += 1;
    }

    const post = await snapshot();
    const deltaRai = post.raiCents - pre.raiCents;
    const deltaCosti = post.costiTotCents - pre.costiTotCents;
    const bankOk = post.cashBankCents === pre.cashBankCents;
    const raiOk = Math.abs(post.raiCents - EXPECTED_RAI_POST) <= TOLERANCE_CENTS;
    const ivaOk =
        post.ivaDebitoCents === pre.ivaDebitoCents && post.ivaCreditoCents === pre.ivaCreditoCents;

    const out = {
        generatedAt: new Date().toISOString(),
        batchId,
        rowsReclassified: n,
        hitEuro: euro(hitCents),
        acceptance: {
            raiPre: euro(EXPECTED_RAI_PRE),
            raiPostAtteso: euro(EXPECTED_RAI_POST),
            deltaAtteso: euro(EXPECTED_DELTA_RAI),
            raiOk,
            bankOk,
            ivaOk,
        },
        pre: {
            at: pre.at,
            rai: euro(pre.raiCents),
            raiCents: pre.raiCents,
            costi: euro(pre.costiTotCents),
            costiCents: pre.costiTotCents,
            banca: euro(pre.cashBankCents),
            bancaCents: pre.cashBankCents,
            ivaDebito: euro(pre.ivaDebitoCents),
            ivaCredito: euro(pre.ivaCreditoCents),
            attive: pre.activeCount,
            vendite: euro(pre.venditeCents),
            stripeTransit: euro(pre.stripeTransitCents),
            stripeTransitCents: pre.stripeTransitCents,
            paypalTransit: euro(pre.paypalTransitCents),
            paypalTransitCents: pre.paypalTransitCents,
        },
        post: {
            at: post.at,
            rai: euro(post.raiCents),
            raiCents: post.raiCents,
            costi: euro(post.costiTotCents),
            costiCents: post.costiTotCents,
            banca: euro(post.cashBankCents),
            bancaCents: post.cashBankCents,
            ivaDebito: euro(post.ivaDebitoCents),
            ivaCredito: euro(post.ivaCreditoCents),
            attive: post.activeCount,
            vendite: euro(post.venditeCents),
            stripeTransit: euro(post.stripeTransitCents),
            stripeTransitCents: post.stripeTransitCents,
            paypalTransit: euro(post.paypalTransitCents),
            paypalTransitCents: post.paypalTransitCents,
        },
        delta: {
            rai: euro(deltaRai),
            raiCents: deltaRai,
            costi: euro(deltaCosti),
            costiCents: deltaCosti,
            banca: euro(post.cashBankCents - pre.cashBankCents),
            paypalTransit: euro(post.paypalTransitCents - pre.paypalTransitCents),
            paypalTransitCents: post.paypalTransitCents - pre.paypalTransitCents,
            stripeTransit: euro(post.stripeTransitCents - pre.stripeTransitCents),
        },
        targets: targets.map((t) => ({
            id: t.id,
            date: dayKey(t.accountingDate),
            prevCategory: t.category,
            amountCents: Math.abs(t.totalCents),
            description: t.description,
        })),
    };

    if (!bankOk || !raiOk) {
        console.error(JSON.stringify({ phase: 'ACCEPTANCE_FAIL', out }, null, 2));
        throw new Error(
            `Acceptance fallita: bankOk=${bankOk} raiOk=${raiOk} (post RAI ${post.raiCents})`
        );
    }

    const md = `# Fase 4b — Lotto 5 ESEGUITO (SDD → transito)

**Eseguito:** ${out.generatedAt}  
**batch_id:** \`${batchId}\`  
**Righe riclassificate:** ${n} · impatto CE **${euro(hitCents)}**

---

## Acceptance

| | Atteso | Ottenuto |
|--|--------|----------|
| RAI pre | ${euro(EXPECTED_RAI_PRE)} | ${out.pre.rai} |
| RAI post | ${euro(EXPECTED_RAI_POST)} | ${out.post.rai} |
| Δ RAI | +${euro(EXPECTED_DELTA_RAI)} | ${out.delta.rai} |
| Banca | invariata | ${bankOk ? 'OK ' + out.post.banca : 'FAIL'} |
| IVA D/C | tipicamente invariata | ${out.post.ivaDebito} / ${out.post.ivaCredito} |

---

## Snapshot PRIMA / DOPO

| Metrica | PRE | POST | Δ |
|---------|-----|------|---|
| RAI | ${out.pre.rai} | ${out.post.rai} | ${out.delta.rai} |
| Costi tot | ${out.pre.costi} | ${out.post.costi} | ${out.delta.costi} |
| Banca cash PnL | ${out.pre.banca} | ${out.post.banca} | ${out.delta.banca} |
| IVA debito | ${out.pre.ivaDebito} | ${out.post.ivaDebito} | — |
| IVA credito | ${out.pre.ivaCredito} | ${out.post.ivaCredito} | — |
| Scritture attive | ${out.pre.attive} | ${out.post.attive} | ${post.activeCount - pre.activeCount} |
| Vendite caratt. | ${out.pre.vendite} | ${out.post.vendite} | — |
| Transito Stripe | ${out.pre.stripeTransit} | ${out.post.stripeTransit} | ${out.delta.stripeTransit} |
| **Transito PayPal** | **${out.pre.paypalTransit}** | **${out.post.paypalTransit}** | **${out.delta.paypalTransit}** |

Storico gap PayPal dichiarato: −€1.568,30. Nuovo saldo ledger transito PayPal: **${out.post.paypalTransit}** (prova tre gambe).

---

## Azione

\`category\` → \`TRASFERIMENTO_INTERNO\` + \`entryNature=TRANSITO\`  
Dare \`${ACCOUNT_BANCA_CO_PAYPAL}\` / Avere \`${ACCOUNT_BANCA_FINECO}\`  
Metadata: \`fase4bLotto=5\` / \`fase4bAction=RECLASS_SDD_TO_TRANSIT\`
`;

    const base = join(process.cwd(), 'docs/verbali');
    writeFileSync(join(base, 'dossier_fase4b_lotto5_eseguito.json'), JSON.stringify(out, null, 2));
    writeFileSync(join(base, 'dossier_fase4b_lotto5_eseguito.md'), md);

    // Freeze post-L5
    const freeze = {
        label: 'FREEZE_UFFICIALE_POST_LOTTO5',
        at: post.at,
        batchId,
        costiTotCents: post.costiTotCents,
        raiCents: post.raiCents,
        cashBankCents: post.cashBankCents,
        ivaDebitoCents: post.ivaDebitoCents,
        ivaCreditoCents: post.ivaCreditoCents,
        activeCount: post.activeCount,
        venditeCaratteristicheCents: post.venditeCents,
        stripeTransitCents: post.stripeTransitCents,
        paypalTransitCents: post.paypalTransitCents,
        euro: {
            costi: out.post.costi,
            rai: out.post.rai,
            banca: out.post.banca,
            ivaDebito: out.post.ivaDebito,
            ivaCredito: out.post.ivaCredito,
            paypalTransit: out.post.paypalTransit,
            stripeTransit: out.post.stripeTransit,
        },
    };
    writeFileSync(join(base, 'dossier_fase4b_freeze_post_lotto5.json'), JSON.stringify(freeze, null, 2));
    writeFileSync(
        join(base, 'dossier_fase4b_freeze_post_lotto5.md'),
        `# Freeze ufficiale post-Lotto 5

**Label:** \`FREEZE_UFFICIALE_POST_LOTTO5\`  
**At:** ${freeze.at}  
**batch_id:** \`${batchId}\`

| Metrica | Valore |
|---------|--------|
| Costi tot | ${freeze.euro.costi} |
| RAI | ${freeze.euro.rai} |
| Banca cash PnL | ${freeze.euro.banca} |
| IVA debito / credito | ${freeze.euro.ivaDebito} / ${freeze.euro.ivaCredito} |
| Scritture attive | ${freeze.activeCount} |
| Vendite caratteristiche | ${euro(freeze.venditeCaratteristicheCents)} |
| Transito Stripe | ${freeze.euro.stripeTransit} |
| Transito PayPal | ${freeze.euro.paypalTransit} |
`
    );

    console.log(JSON.stringify({ phase: 'done', ...out.acceptance, delta: out.delta, paypalPost: out.post.paypalTransit }, null, 2));
}

main()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
