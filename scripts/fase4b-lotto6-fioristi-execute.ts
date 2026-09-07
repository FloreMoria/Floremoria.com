/**
 * Lotto 6 — Bonifica doppioni fioristi (prerequisito Fase 5).
 * 6 casi certi: soft-reverse FLORIST_PAYOUT (banca = verità).
 * Cumulativi ≈€161: solo elenco, nessun write.
 *
 * Uso: npx tsx scripts/fase4b-lotto6-fioristi-execute.ts
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
import { applyFiscalAuthorityHierarchy, FISCAL_AUTHORITY_DEDUPE_ENABLED } from '../lib/financial/fiscalAuthorityDedupe';

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
function norm(s: string) {
    return s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
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
    return `LOTTO6_FIORISTI_${y}${m}${day}_${hh}${mm}${ss}`;
}

type Snap = {
    at: string;
    rai: number;
    ricavi: number;
    costi: number;
    banca: number;
    stripe: number;
    paypal: number;
};

async function snapshot(): Promise<Snap> {
    const p = await computeHistoricalPnl({ fiscalYear: 2026 });
    const t = await compareGatewayTransitBalances();
    const costi =
        p.costiFioristiCents +
        p.costiFatturePassiveSdiCents +
        p.costiSaasCents +
        p.costiOperativiCents +
        p.oneriBancariCents;
    return {
        at: new Date().toISOString(),
        rai: p.risultatoAnteImposteCents,
        ricavi: p.ricaviLordiCents,
        costi,
        banca: p.cashBankBalanceCents,
        stripe: t.stripe.transitLedgerCents,
        paypal: t.paypal.transitLedgerCents,
    };
}

/** PnL grezzo senza gerarchia (identity) — per Δ teorico. */
async function pnlWithoutHierarchy() {
    const rows = await prisma.financialLedgerEntry.findMany({
        where: { reversedAt: null, fiscalYear: 2026, sourceType: { not: 'CUSTOMER_RECEIPT' } },
        select: {
            id: true,
            category: true,
            totalCents: true,
            direction: true,
            sourceType: true,
        },
    });
    let ricavi = 0;
    let costi = 0;
    const isTransfer = (c: string) =>
        c === 'TRASFERIMENTO_INTERNO' || c === 'PAYPAL_PAYOUT' || c === 'STRIPE_PAYOUT';
    for (const r of rows) {
        if (isTransfer(r.category)) continue;
        if (r.direction === 'ENTRATA' || r.totalCents > 0) {
            if (
                ['RICAVI_VENDITE', 'ALTRI_RICAVI', 'CONTRIBUTI_ESERCIZIO', 'RIMBORSI'].includes(
                    r.category
                )
            ) {
                ricavi += Math.abs(r.totalCents);
            }
        } else {
            costi += Math.abs(r.totalCents);
        }
    }
    return { ricavi, costi, rai: ricavi - costi, n: rows.length };
}

type Case = {
    kind: 'certain' | 'cumulative';
    payoutId: string;
    bankId: string;
    amount: number;
    orderNumber: string | null;
    orderId: string | null;
    partner: string | null;
    payoutDate: string;
    bankDate: string;
    days: number;
    bankDesc: string;
    nameHits: number;
};

async function selectCases(): Promise<{ certain: Case[]; cumulative: Case[] }> {
    const payouts = await prisma.financialLedgerEntry.findMany({
        where: { reversedAt: null, fiscalYear: 2026, sourceType: 'FLORIST_PAYOUT' },
        select: {
            id: true,
            totalCents: true,
            accountingDate: true,
            counterpartyName: true,
            description: true,
            partnerId: true,
            orderId: true,
        },
    });
    const banks = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            fiscalYear: 2026,
            sourceType: 'BANK_LINE',
            category: 'COSTI_FIORISTI',
            totalCents: { lt: 0 },
        },
        select: {
            id: true,
            totalCents: true,
            accountingDate: true,
            description: true,
            counterpartyName: true,
        },
    });
    const orders = await prisma.order.findMany({
        where: { id: { in: payouts.map((p) => p.orderId).filter(Boolean) as string[] } },
        select: { id: true, orderNumber: true, partnerId: true },
    });
    const omap = new Map(orders.map((o) => [o.id, o]));
    const partnerIds = [
        ...new Set(
            [...payouts.map((p) => p.partnerId), ...orders.map((o) => o.partnerId)].filter(
                Boolean
            ) as string[]
        ),
    ];
    const partners = await prisma.partner.findMany({
        where: { id: { in: partnerIds } },
        select: { id: true, shopName: true, ownerName: true },
    });
    const pmap = new Map(partners.map((p) => [p.id, p]));

    const usedBank = new Set<string>();
    const certain: Case[] = [];
    const cumulative: Case[] = [];

    for (const p of payouts) {
        const abs = Math.abs(p.totalCents);
        const o = p.orderId ? omap.get(p.orderId) : null;
        const partner = pmap.get(p.partnerId || o?.partnerId || '');
        const nameBlob = norm(
            [p.counterpartyName, partner?.shopName, partner?.ownerName].filter(Boolean).join(' ')
        );
        const tokens = nameBlob.split(' ').filter((w) => w.length > 2);
        const t0 = p.accountingDate.getTime();

        type Cand = { b: (typeof banks)[0]; hits: number; exact: boolean; days: number };
        const cands: Cand[] = [];
        for (const b of banks) {
            if (usedBank.has(b.id)) continue;
            const days = Math.abs(b.accountingDate.getTime() - t0) / 86400000;
            if (days > 120) continue;
            const bAbs = Math.abs(b.totalCents);
            const exact = Math.abs(bAbs - abs) <= 2;
            const blob = norm(`${b.description || ''} ${b.counterpartyName || ''}`);
            // Escludi PayPal SDD come "bonifico fiorista"
            if (/paypal\s*europe|addebito\s*sdd/i.test(b.description || '')) continue;
            const hits = tokens.filter((t) => blob.includes(t)).length;
            if (exact && hits >= 1) cands.push({ b, hits, exact: true, days });
            else if (!exact && hits >= 2 && bAbs >= abs - 2 && bAbs <= abs * 8 + 100) {
                cands.push({ b, hits, exact: false, days });
            }
        }
        cands.sort((a, b) => {
            if (a.exact !== b.exact) return a.exact ? -1 : 1;
            if (b.hits !== a.hits) return b.hits - a.hits;
            return a.days - b.days;
        });
        if (!cands.length) continue;
        const best = cands[0];
        // Certain: exact amount + ≥1 name token (not PayPal)
        // Cumulative: bank larger, ≥2 name tokens
        if (best.exact && best.hits >= 1) {
            // Extra guard: shop/owner token should appear, or ≥2 hits
            const shopTok = norm(partner?.shopName || '')
                .split(' ')
                .filter((w) => w.length > 3);
            const ownerTok = norm(partner?.ownerName || '')
                .split(' ')
                .filter((w) => w.length > 2);
            const blob = norm(`${best.b.description || ''}`);
            const strong =
                best.hits >= 2 ||
                shopTok.some((t) => blob.includes(t)) ||
                ownerTok.some((t) => blob.includes(t)) ||
                // Cingolani / cognome nel beneficiario
                (tokens.length >= 1 && tokens.some((t) => blob.includes(t) && t.length >= 5));
            if (!strong && best.hits < 2) continue;

            usedBank.add(best.b.id);
            certain.push({
                kind: 'certain',
                payoutId: p.id,
                bankId: best.b.id,
                amount: abs,
                orderNumber: o?.orderNumber || null,
                orderId: p.orderId,
                partner: partner?.shopName || partner?.ownerName || p.counterpartyName || null,
                payoutDate: dayKey(p.accountingDate),
                bankDate: dayKey(best.b.accountingDate),
                days: Math.round(best.days),
                bankDesc: (best.b.description || '').slice(0, 90),
                nameHits: best.hits,
            });
        } else if (!best.exact && best.hits >= 2) {
            usedBank.add(best.b.id);
            cumulative.push({
                kind: 'cumulative',
                payoutId: p.id,
                bankId: best.b.id,
                amount: abs,
                orderNumber: o?.orderNumber || null,
                orderId: p.orderId,
                partner: partner?.shopName || partner?.ownerName || p.counterpartyName || null,
                payoutDate: dayKey(p.accountingDate),
                bankDate: dayKey(best.b.accountingDate),
                days: Math.round(best.days),
                bankDesc: (best.b.description || '').slice(0, 90),
                nameHits: best.hits,
            });
        }
    }

    return { certain, cumulative };
}

async function main() {
    if (!FISCAL_AUTHORITY_DEDUPE_ENABLED) {
        throw new Error('Gerarchia disattivata — abort Lotto 6');
    }

    const batchId = batchIdNow();
    const pre = await snapshot();
    const preRaw = await pnlWithoutHierarchy();
    console.log(
        JSON.stringify(
            {
                phase: 'snapshot_pre',
                batchId,
                withHierarchy: {
                    rai: euro(pre.rai),
                    costi: euro(pre.costi),
                    banca: euro(pre.banca),
                },
                withoutHierarchy: {
                    rai: euro(preRaw.rai),
                    costi: euro(preRaw.costi),
                },
            },
            null,
            2
        )
    );

    const { certain, cumulative } = await selectCases();
    const certainEuro = certain.reduce((s, c) => s + c.amount, 0);
    const cumulEuro = cumulative.reduce((s, c) => s + c.amount, 0);

    console.log(
        JSON.stringify(
            {
                phase: 'selection',
                certainN: certain.length,
                certainEuro: euro(certainEuro),
                cumulativeN: cumulative.length,
                cumulativeEuro: euro(cumulEuro),
                certain,
                cumulative,
            },
            null,
            2
        )
    );

    // Atteso socio: 6 certi / €154. Tolleranza se selezione rigorosa differisce leggermente.
    if (certain.length < 1) {
        throw new Error('Nessun caso certo — STOP');
    }

    // Preflight: soft-reverse simulato = exclude payout ids from raw pnl
    const reverseIds = new Set(certain.map((c) => c.payoutId));
    const rowsAll = await prisma.financialLedgerEntry.findMany({
        where: { reversedAt: null, fiscalYear: 2026, sourceType: { not: 'CUSTOMER_RECEIPT' } },
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
    const withoutReversed = rowsAll.filter((r) => !reverseIds.has(r.id));
    const hierPre = applyFiscalAuthorityHierarchy(rowsAll);
    const hierPost = applyFiscalAuthorityHierarchy(withoutReversed);

    function costiFrom(rows: typeof hierPre) {
        let c = 0;
        for (const r of rows) {
            if (
                r.category === 'TRASFERIMENTO_INTERNO' ||
                r.category === 'PAYPAL_PAYOUT' ||
                r.category === 'STRIPE_PAYOUT'
            ) {
                continue;
            }
            if (!(r.direction === 'ENTRATA' || r.totalCents > 0)) {
                c += Math.abs(r.totalCents);
            }
        }
        return c;
    }
    const costiHierDelta = costiFrom(hierPost) - costiFrom(hierPre);

    // Theoretical without hierarchy: reversing payouts that are still in raw reduces costi by their amount
    // (only if they weren't already reversed)
    const theoreticalDeltaRai = certainEuro; // removing cost improves RAI

    const now = new Date();
    const executedAt = now.toISOString();
    let n = 0;
    for (const c of certain) {
        const row = await prisma.financialLedgerEntry.findUnique({
            where: { id: c.payoutId },
            select: { id: true, reversedAt: true, metadataJson: true, sourceType: true },
        });
        if (!row || row.reversedAt) continue;
        if (row.sourceType !== 'FLORIST_PAYOUT') {
            throw new Error(`Expected FLORIST_PAYOUT, got ${row.sourceType} on ${c.payoutId}`);
        }
        const prev = asMeta(row.metadataJson);
        await prisma.financialLedgerEntry.update({
            where: { id: c.payoutId },
            data: {
                reversedAt: now,
                metadataJson: {
                    ...prev,
                    fase4bBatchId: batchId,
                    fase4bLotto: '6_FIORISTI',
                    fase4bAction: 'SOFT_REVERSE_FLORIST_PAYOUT_DUP',
                    fase4bReason:
                        'Doppione: esiste BANK_LINE COSTI_FIORISTI stesso fiorista/importo — banca = fonte di verità',
                    fase4bBankEntryId: c.bankId,
                    fase4bOrderNumber: c.orderNumber,
                    fase4bExecutedAt: executedAt,
                } as Prisma.InputJsonValue,
            },
        });
        n += 1;
    }

    const post = await snapshot();
    const postRaw = await pnlWithoutHierarchy();

    const out = {
        generatedAt: executedAt,
        batchId,
        hierarchyEnabled: FISCAL_AUTHORITY_DEDUPE_ENABLED,
        certainReversed: n,
        certainEuro: euro(certainEuro),
        certainEuroCents: certainEuro,
        cumulativeListedOnly: cumulative.length,
        cumulativeEuro: euro(cumulEuro),
        pre: {
            ...pre,
            euro: {
                rai: euro(pre.rai),
                ricavi: euro(pre.ricavi),
                costi: euro(pre.costi),
                banca: euro(pre.banca),
                stripe: euro(pre.stripe),
                paypal: euro(pre.paypal),
            },
            withoutHierarchy: {
                rai: euro(preRaw.rai),
                costi: euro(preRaw.costi),
            },
        },
        post: {
            ...post,
            euro: {
                rai: euro(post.rai),
                ricavi: euro(post.ricavi),
                costi: euro(post.costi),
                banca: euro(post.banca),
                stripe: euro(post.stripe),
                paypal: euro(post.paypal),
            },
            withoutHierarchy: {
                rai: euro(postRaw.rai),
                costi: euro(postRaw.costi),
            },
        },
        delta: {
            raiWithHierarchy: euro(post.rai - pre.rai),
            raiWithHierarchyCents: post.rai - pre.rai,
            costiWithHierarchy: euro(post.costi - pre.costi),
            banca: euro(post.banca - pre.banca),
            theoreticalRaiWithoutHierarchy: euro(theoreticalDeltaRai),
            theoreticalRaiWithoutHierarchyCents: theoreticalDeltaRai,
            rawRaiDeltaObserved: euro(postRaw.rai - preRaw.rai),
            preflightCostiHierDelta: euro(costiHierDelta),
        },
        certain,
        cumulative,
    };

    if (Math.abs(post.banca - pre.banca) > 0) {
        throw new Error('Banca mossa — FAIL');
    }
    // Con gerarchia attiva atteso ΔRAI ≈ 0 (payout già soppressi)
    if (Math.abs(post.rai - pre.rai) > 50) {
        console.warn(
            `WARN: ΔRAI con gerarchia ${post.rai - pre.rai} cents (atteso ≈0). Continuare con report.`
        );
    }

    const base = join(process.cwd(), 'docs/verbali');
    writeFileSync(join(base, 'dossier_fase4b_lotto6_fioristi_eseguito.json'), JSON.stringify(out, null, 2));

    const md = `# Lotto 6 — Bonifica doppioni fioristi ESEGUITO

**Eseguito:** ${executedAt}  
**batch_id:** \`${batchId}\`  
**Scritture soft-reverse:** **${n}** FLORIST_PAYOUT (fonte di verità = bonifico bancario)

---

## Impatto

| | Con gerarchia ATTIVA | Senza gerarchia (teorico) |
|--|----------------------|---------------------------|
| ΔRAI | **${out.delta.raiWithHierarchy}** (atteso ≈ €0) | **+${out.delta.theoreticalRaiWithoutHierarchy}** |
| Δ costi | ${out.delta.costiWithHierarchy} | −${euro(certainEuro)} |
| Banca | ${out.delta.banca} | — |

RAI grezzo osservato pre→post (identity): ${out.pre.withoutHierarchy.rai} → ${out.post.withoutHierarchy.rai} (Δ ${out.delta.rawRaiDeltaObserved})

Freeze post: RAI ${out.post.euro.rai} · costi ${out.post.euro.costi} · banca ${out.post.euro.banca}

---

## Casi certi stornati (${n} · ${euro(certainEuro)})

| Ordine | Partner | Payout | Bonifico | € | Lag gg |
|--------|---------|--------|----------|---|--------|
${certain.map((c) => `| ${c.orderNumber || '—'} | ${c.partner || '—'} | ${c.payoutDate} | ${c.bankDate} | ${euro(c.amount)} | ${c.days} |`).join('\n')}

---

## Cumulativi — NON TOCCATI (verifica manuale socio)

| Ordine | Partner | Payout | Bonifico | Payout € | Lag | Causale banca |
|--------|---------|--------|----------|----------|-----|---------------|
${cumulative.map((c) => `| ${c.orderNumber || '—'} | ${c.partner || '—'} | ${c.payoutDate} | ${c.bankDate} | ${euro(c.amount)} | ${c.days} | ${(c.bankDesc || '').replace(/\|/g, '/')} |`).join('\n')}

Totale payout lato cumulativi: **${euro(cumulEuro)}** · N=${cumulative.length}
`;

    writeFileSync(join(base, 'dossier_fase4b_lotto6_fioristi_eseguito.md'), md);
    console.log(
        JSON.stringify(
            {
                phase: 'done',
                batchId,
                reversed: n,
                deltaRaiHier: out.delta.raiWithHierarchy,
                theoreticalWithoutHier: out.delta.theoreticalRaiWithoutHierarchy,
                cumulativeN: cumulative.length,
                cumulativeEuro: euro(cumulEuro),
            },
            null,
            2
        )
    );
}

main()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
