/**
 * Export elenco ordini .com / .eu con distinzione pagamenti.
 * Uso: npx tsx scripts/export-orders-com-eu.ts
 *
 * Sito:
 * - COM = Stripe account floremoria.com (stripe_tx_*)
 * - EU  = Stripe account floremoria.eu / PSA (stripe_eu_tx_*)
 * - match nome+importo+data vs charge EU e lista titolare .eu
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();
if (process.env.DATABASE_URL_UNPOOLED) {
    process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
}

import fs from 'fs';
import path from 'path';
import prisma from '../lib/prisma';

/** Lista titolare incassi .eu 2026 (fonte operativa già usata in fase4b-eu-orders-reconcile). */
const EU_TITOLARE_RAW = `
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
            date: date.trim(),
            customer: customer.trim(),
            cents: Math.round(parseFloat(amount) * 100),
            nameless: /^\(senza nome\)$/i.test(customer.trim()),
        };
    });

function euroFromCents(cents: number | null | undefined) {
    if (cents == null || Number.isNaN(Number(cents))) return '—';
    return (Number(cents) / 100).toLocaleString('it-IT', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
    });
}

function euroFloat(n: number | null | undefined) {
    if (n == null || Number.isNaN(Number(n))) return '—';
    return Number(n).toLocaleString('it-IT', {
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

function nameScore(a: string, b: string): number {
    if (!a || !b) return 0;
    if (/senza nome/i.test(a) || /senza nome/i.test(b)) return 0;
    const na = normName(a);
    const nb = normName(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;
    const ta = na.split(' ').filter((t) => t.length > 1).sort().join(' ');
    const tb = nb.split(' ').filter((t) => t.length > 1).sort().join(' ');
    if (ta && ta === tb) return 0.98;
    const setA = new Set(na.split(' ').filter((t) => t.length > 1));
    const setB = new Set(nb.split(' ').filter((t) => t.length > 1));
    if (!setA.size || !setB.size) return 0;
    let inter = 0;
    for (const t of setA) if (setB.has(t)) inter++;
    const union = new Set([...setA, ...setB]).size;
    const jaccard = inter / union;
    if (na.includes(nb) || nb.includes(na)) return Math.max(jaccard, 0.85);
    return jaccard;
}

function daysBetween(a: string, b: Date) {
    const bd = b.toISOString().slice(0, 10);
    return Math.abs(Date.parse(a + 'T12:00:00Z') - Date.parse(bd + 'T12:00:00Z')) / 86400000;
}

function classifyGateway(paymentMethodLabel: string | null, stripeTransactionId: string | null): string {
    const label = (paymentMethodLabel || '').trim();
    const low = label.toLowerCase();
    const tid = (stripeTransactionId || '').trim();

    if (low.includes('test_mock') || low.includes('mock')) return 'Test mock (non reale)';
    if (low.includes('paypal') && low.includes('stripe')) return 'Stripe · PayPal (wallet)';
    if (low.includes('paypal')) return 'PayPal';
    if (low.includes('apple')) return 'Stripe · Apple Pay';
    if (low.includes('google')) return 'Stripe · Google Pay';
    if (low.includes('carta') || low.includes('card') || low.includes('credit')) return 'Stripe · Carta';
    if (low.includes('stripe')) return `Stripe · ${label}`;
    if (tid.startsWith('txn_') || tid.startsWith('pi_') || tid.startsWith('ch_') || tid.startsWith('py_')) {
        return label ? `Stripe · ${label}` : 'Stripe (metodo non etichettato)';
    }
    if (label) return label;
    if (tid) return 'Incasso con id gateway (label assente)';
    return 'Non registrato su Order';
}

type Site = 'COM' | 'EU' | 'UNKNOWN';

async function main() {
    const orders = await prisma.order.findMany({
        where: { deletedAt: null },
        select: {
            id: true,
            orderNumber: true,
            status: true,
            partnerPaymentStatus: true,
            paymentMethodLabel: true,
            stripeTransactionId: true,
            grossAmount: true,
            netAmount: true,
            stripeFee: true,
            totalPriceCents: true,
            createdAt: true,
            isTest: true,
            isRecurring: true,
            buyerFullName: true,
            buyerEmail: true,
            deceasedName: true,
            cemeteryName: true,
            cemeteryCity: true,
            deliveryProvince: true,
            agencyName: true,
            partnershipChannel: true,
            additionalInstructions: true,
            financeNotes: true,
            partner: { select: { shopName: true, ownerName: true } },
            items: {
                select: {
                    quantity: true,
                    priceCents: true,
                    product: { select: { name: true } },
                },
            },
        },
        orderBy: { createdAt: 'asc' },
    });

    const stripeMovs = await prisma.stripeFinanceMovement.findMany({
        where: { type: { in: ['charge', 'payment'] } },
        select: {
            stripeId: true,
            type: true,
            amountCents: true,
            feeCents: true,
            netCents: true,
            createdAtStripe: true,
            orderId: true,
            description: true,
            sourceId: true,
            metadataJson: true,
        },
    });

    const byOrderId = new Map<string, { site: Site; evidence: string; stripeId: string }>();
    const byTxn = new Map<string, { site: Site; evidence: string; stripeId: string }>();
    const euCharges: typeof stripeMovs = [];
    const comCharges: typeof stripeMovs = [];

    for (const m of stripeMovs) {
        const isEu = m.stripeId.startsWith('stripe_eu_');
        const site: Site = isEu ? 'EU' : 'COM';
        if (isEu) euCharges.push(m);
        else comCharges.push(m);

        if (m.orderId && !byOrderId.has(m.orderId)) {
            byOrderId.set(m.orderId, {
                site,
                evidence: `StripeFinanceMovement.orderId (${m.stripeId})`,
                stripeId: m.stripeId,
            });
        }

        const ids = [m.stripeId, m.sourceId || ''];
        const meta = (m.metadataJson && typeof m.metadataJson === 'object'
            ? (m.metadataJson as Record<string, unknown>)
            : {}) as Record<string, unknown>;
        for (const v of Object.values(meta)) {
            if (typeof v === 'string') ids.push(v);
        }
        for (const raw of ids) {
            const mTxn = String(raw).match(/(txn_|pi_|ch_|py_|cs_)[A-Za-z0-9]+/);
            if (mTxn && !byTxn.has(mTxn[0])) {
                byTxn.set(mTxn[0], {
                    site,
                    evidence: `StripeFinanceMovement ${m.stripeId}`,
                    stripeId: m.stripeId,
                });
            }
        }
    }

    // Match soft: charge EU amount+date → order
    function bestEuChargeMatch(o: (typeof orders)[0]): {
        site: Site;
        evidence: string;
        stripeId?: string;
    } | null {
        let best: { score: number; m: (typeof euCharges)[0]; dayDiff: number } | null = null;
        for (const m of euCharges) {
            if (Math.abs(m.amountCents - o.totalPriceCents) > 2) continue;
            const dayDiff = daysBetween(m.createdAtStripe.toISOString().slice(0, 10), o.createdAt);
            if (dayDiff > 5) continue;
            // Prefer description / metadata customer if any; else amount+date only is weak
            const meta = (m.metadataJson && typeof m.metadataJson === 'object'
                ? (m.metadataJson as Record<string, unknown>)
                : {}) as Record<string, unknown>;
            const metaName = String(
                meta.customerName || meta.billing_name || meta.buyer || m.description || ''
            );
            const scoreName = nameScore(o.buyerFullName || '', metaName);
            const score = scoreName > 0 ? scoreName : dayDiff <= 1 ? 0.55 : 0.4;
            if (!best || score > best.score || (score === best.score && dayDiff < best.dayDiff)) {
                best = { score, m, dayDiff };
            }
        }
        if (!best || best.score < 0.55) return null;
        return {
            site: 'EU',
            evidence: `match charge EU €${(best.m.amountCents / 100).toFixed(2)} ±${best.dayDiff.toFixed(0)}g (score ${best.score.toFixed(2)})`,
            stripeId: best.m.stripeId,
        };
    }

    function bestTitolareEuMatch(o: (typeof orders)[0]): {
        site: Site;
        evidence: string;
    } | null {
        let best: {
            score: number;
            row: (typeof EU_TITOLARE_RAW)[0];
            dayDiff: number;
            amountOk: boolean;
        } | null = null;
        for (const row of EU_TITOLARE_RAW) {
            if (row.nameless) continue;
            const dayDiff = daysBetween(row.date, o.createdAt);
            if (dayDiff > 7) continue;
            const score = nameScore(o.buyerFullName || '', row.customer);
            if (score < 0.72) continue;
            const amountOk = Math.abs(row.cents - o.totalPriceCents) <= 2;
            // Nome forte ±2gg: OK anche se importo lista ≠ listino ordine
            if (!amountOk && !(score >= 0.9 && dayDiff <= 2)) continue;
            const rank = score + (amountOk ? 0.2 : 0) - dayDiff * 0.01;
            const bestRank = best
                ? best.score + (best.amountOk ? 0.2 : 0) - best.dayDiff * 0.01
                : -1;
            if (!best || rank > bestRank) {
                best = { score, row, dayDiff, amountOk };
            }
        }
        if (!best) return null;
        return {
            site: 'EU',
            evidence: `lista titolare .eu «${best.row.customer}» ${best.row.date}${
                best.amountOk ? '' : ' (nome/data; importo lista diverso)'
            } (score ${best.score.toFixed(2)})`,
        };
    }

    function bestComChargeMatch(o: (typeof orders)[0]): {
        site: Site;
        evidence: string;
        stripeId?: string;
    } | null {
        if (!o.stripeTransactionId) return null;
        const hit = byTxn.get(o.stripeTransactionId);
        if (hit) return hit;
        for (const [k, v] of byTxn) {
            if (o.stripeTransactionId.includes(k) || k.includes(o.stripeTransactionId)) return v;
        }
        return null;
    }

    type Row = {
        orderNumber: string;
        createdAt: string;
        status: string;
        partnerPaymentStatus: string;
        site: string;
        siteEvidence: string;
        gateway: string;
        paymentLabel: string;
        stripeTx: string;
        stripeMovementId: string;
        lordoListino: string;
        lordoStripe: string;
        netto: string;
        fee: string;
        buyer: string;
        email: string;
        deceased: string;
        products: string;
        cemetery: string;
        city: string;
        partner: string;
        agency: string;
        isTest: string;
        isRecurring: string;
        orderId: string;
    };

    const rows: Row[] = [];
    const counters = {
        total: 0,
        com: 0,
        eu: 0,
        unknownSite: 0,
        paid: 0,
        test: 0,
        byGateway: {} as Record<string, number>,
        bySiteGateway: {} as Record<string, number>,
        byPaymentStatus: {} as Record<string, number>,
    };

    const usedEuChargeIds = new Set<string>();

    for (const o of orders) {
        let site: Site = 'UNKNOWN';
        let siteEvidence = 'nessun indizio';
        let stripeMovementId = '—';

        const fromOrderLink = byOrderId.get(o.id);
        const fromTxn = bestComChargeMatch(o);
        const fromEuCharge = bestEuChargeMatch(o);
        const fromTitolare = bestTitolareEuMatch(o);

        // Priorità: link esplicito → txn Stripe → charge EU amount/date → lista titolare → default COM se txn COM-like
        if (fromOrderLink) {
            site = fromOrderLink.site;
            siteEvidence = fromOrderLink.evidence;
            stripeMovementId = fromOrderLink.stripeId;
        } else if (fromTxn) {
            site = fromTxn.site;
            siteEvidence = fromTxn.evidence;
            stripeMovementId = fromTxn.stripeId;
        } else if (fromEuCharge) {
            site = 'EU';
            siteEvidence = fromEuCharge.evidence;
            stripeMovementId = fromEuCharge.stripeId || '—';
            if (fromEuCharge.stripeId) usedEuChargeIds.add(fromEuCharge.stripeId);
        } else if (fromTitolare) {
            site = 'EU';
            siteEvidence = fromTitolare.evidence;
        } else if (o.stripeTransactionId && /^txn_|^pi_|^ch_|^py_/.test(o.stripeTransactionId)) {
            // txn su Order tipicamente da sync COM (account 4W4pZWhSUs nelle sample)
            site = 'COM';
            siteEvidence = 'default COM: stripeTransactionId presente senza match EU';
        } else {
            const blob = `${o.additionalInstructions || ''} ${o.financeNotes || ''} ${o.buyerEmail || ''}`.toLowerCase();
            if (blob.includes('floremoria.eu')) {
                site = 'EU';
                siteEvidence = 'testo ordine contiene floremoria.eu';
            } else if (blob.includes('floremoria.com')) {
                site = 'COM';
                siteEvidence = 'testo ordine contiene floremoria.com';
            }
        }

        if (stripeMovementId !== '—' && stripeMovementId.startsWith('stripe_eu_')) {
            usedEuChargeIds.add(stripeMovementId);
        }

        const gateway = classifyGateway(o.paymentMethodLabel, o.stripeTransactionId);
        const products = o.items
            .map((i) => `${i.quantity}× ${i.product?.name || '?'} (${euroFromCents(i.priceCents)})`)
            .join('; ');

        rows.push({
            orderNumber: o.orderNumber || o.id.slice(0, 12),
            createdAt: o.createdAt.toISOString().slice(0, 10),
            status: String(o.status),
            partnerPaymentStatus: String(o.partnerPaymentStatus),
            site,
            siteEvidence,
            gateway,
            paymentLabel: o.paymentMethodLabel || '—',
            stripeTx: o.stripeTransactionId || '—',
            stripeMovementId,
            lordoListino: euroFromCents(o.totalPriceCents),
            lordoStripe: euroFloat(o.grossAmount),
            netto: euroFloat(o.netAmount),
            fee: euroFloat(o.stripeFee),
            buyer: o.buyerFullName || '—',
            email: o.buyerEmail || '—',
            deceased: o.deceasedName || '—',
            products: products || '—',
            cemetery: o.cemeteryName || '—',
            city: [o.cemeteryCity, o.deliveryProvince].filter(Boolean).join(' ') || '—',
            partner: o.partner?.shopName || o.partner?.ownerName || '—',
            agency: o.agencyName || o.partnershipChannel || '—',
            isTest: o.isTest ? 'SÌ' : 'NO',
            isRecurring: o.isRecurring ? 'SÌ' : 'NO',
            orderId: o.id,
        });

        counters.total++;
        if (o.isTest) counters.test++;
        if (String(o.partnerPaymentStatus) === 'PAID') counters.paid++;
        if (site === 'COM') counters.com++;
        else if (site === 'EU') counters.eu++;
        else counters.unknownSite++;
        counters.byGateway[gateway] = (counters.byGateway[gateway] || 0) + 1;
        const sg = `${site} · ${gateway}`;
        counters.bySiteGateway[sg] = (counters.bySiteGateway[sg] || 0) + 1;
        const ps = String(o.partnerPaymentStatus);
        counters.byPaymentStatus[ps] = (counters.byPaymentStatus[ps] || 0) + 1;
    }

    // Charge EU senza ordine collegato (per sezione orphan)
    const orphanEu = euCharges
        .filter((m) => !usedEuChargeIds.has(m.stripeId) && !m.orderId)
        .map((m) => ({
            date: m.createdAtStripe.toISOString().slice(0, 10),
            amount: euroFromCents(m.amountCents),
            type: m.type,
            stripeId: m.stripeId,
            description: (m.description || '—').slice(0, 80),
        }));

    const outDir = path.join(process.cwd(), 'docs/verbali');
    const mdPath = path.join(outDir, 'elenco_ordini_com_eu_pagamenti.md');
    const csvPath = path.join(outDir, 'elenco_ordini_com_eu_pagamenti.csv');
    const jsonPath = path.join(outDir, 'elenco_ordini_com_eu_pagamenti.json');

    const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    const csvHeader = [
        'orderNumber',
        'createdAt',
        'status',
        'partnerPaymentStatus',
        'sito',
        'evidenza_sito',
        'gateway_pagamento',
        'payment_method_label',
        'stripe_transaction_id',
        'stripe_movement_id',
        'lordo_listino',
        'lordo_stripe',
        'netto',
        'fee',
        'acquirente',
        'email',
        'defunto',
        'prodotti',
        'cimitero',
        'citta',
        'fiorista',
        'agenzia',
        'test',
        'abbonamento',
        'orderId',
    ];
    const csvLines = [
        csvHeader.join(','),
        ...rows.map((r) =>
            [
                r.orderNumber,
                r.createdAt,
                r.status,
                r.partnerPaymentStatus,
                r.site,
                r.siteEvidence,
                r.gateway,
                r.paymentLabel,
                r.stripeTx,
                r.stripeMovementId,
                r.lordoListino,
                r.lordoStripe,
                r.netto,
                r.fee,
                r.buyer,
                r.email,
                r.deceased,
                r.products,
                r.cemetery,
                r.city,
                r.partner,
                r.agency,
                r.isTest,
                r.isRecurring,
                r.orderId,
            ]
                .map(esc)
                .join(',')
        ),
    ];

    const byCom = rows.filter((r) => r.site === 'COM');
    const byEu = rows.filter((r) => r.site === 'EU');
    const byUnk = rows.filter((r) => r.site === 'UNKNOWN');

    function section(title: string, list: Row[]) {
        if (!list.length) return `### ${title}\n\n_Nessun ordine._\n`;
        const head =
            `| # | Ordine | Data | Pag. | Gateway | Lordo | Acquirente | Città |\n` +
            `|---|--------|------|------|---------|-------|------------|-------|\n`;
        const body = list
            .map((r, i) => {
                const buyer = r.buyer.replace(/\|/g, '/').slice(0, 36);
                return `| ${i + 1} | \`${r.orderNumber}\` | ${r.createdAt} | ${r.partnerPaymentStatus} | ${r.gateway} | ${r.lordoListino} | ${buyer} | ${r.city} |`;
            })
            .join('\n');
        return `### ${title} (${list.length})\n\n${head}${body}\n`;
    }

    const payMatrix: Record<string, Record<string, number>> = {};
    for (const r of rows) {
        if (!payMatrix[r.site]) payMatrix[r.site] = {};
        payMatrix[r.site][r.gateway] = (payMatrix[r.site][r.gateway] || 0) + 1;
    }

    const md = `# Elenco ordini — floremoria.com vs floremoria.eu + pagamenti

**Generato:** ${new Date().toISOString()}  
**Fonte:** Neon \`Order\` + \`StripeFinanceMovement\` (prefissi \`stripe_tx_\` = COM, \`stripe_eu_tx_\` = EU) + lista titolare incassi .eu.

## Come si distingue il sito

| Sito | Significato | Evidenza usata |
|------|-------------|----------------|
| **COM** | Checkout / Stripe **floremoria.com** | Movimento \`stripe_tx_*\` collegato, oppure \`stripeTransactionId\` presente senza match EU |
| **EU** | Checkout / Stripe **floremoria.eu** (PSA San Marco) | Movimento \`stripe_eu_tx_*\`, match importo+data vs charge EU, o lista titolare .eu (nome+importo+data) |
| **UNKNOWN** | Non determinabile | Tipico: UNPAID, test mock, o PAID legacy senza id Stripe e senza match lista |

## Come si distingue il pagamento

Da \`paymentMethodLabel\` (+ \`stripeTransactionId\`):

| Gateway riportato | Origine tipica |
|-------------------|----------------|
| Stripe · Carta | \`Carta (Stripe)\` |
| Stripe · PayPal (wallet) | \`PayPal (Stripe)\` — PayPal **tramite** Stripe Elements su .com |
| PayPal | PayPal nativo (raro se label senza Stripe) |
| Stripe (metodo non etichettato) | Solo id \`txn_\`/\`pi_\` |
| Non registrato su Order | Label e id entrambi vuoti (molti ordini .eu legacy) |
| Test mock | \`TEST_MOCK_PAID\` |

## Riepilogo

| Metrica | N |
|---------|---|
| Ordini totali (non cancellati) | **${counters.total}** |
| \`partnerPaymentStatus = PAID\` | ${counters.paid} |
| Test | ${counters.test} |
| Sito **COM** (.com) | **${counters.com}** |
| Sito **EU** (.eu) | **${counters.eu}** |
| Sito **UNKNOWN** | **${counters.unknownSite}** |
| Charge/payment Stripe COM in DB | ${comCharges.length} |
| Charge/payment Stripe EU in DB | ${euCharges.length} |
| Charge EU senza ordine abbinato (lista sotto) | ${orphanEu.length} |

### Stato pagamento partner

${Object.entries(counters.byPaymentStatus)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `- **${k}**: ${v}`)
    .join('\n')}

### Gateway

${Object.entries(counters.byGateway)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `- **${k}**: ${v}`)
    .join('\n')}

### Matrice sito × pagamento

| Sito | Gateway | N |
|------|---------|---|
${Object.entries(payMatrix)
    .flatMap(([site, gateways]) =>
        Object.entries(gateways)
            .sort((a, b) => b[1] - a[1])
            .map(([g, n]) => `| ${site} | ${g} | ${n} |`)
    )
    .join('\n')}

## Elenco per sito

${section('A — floremoria.com (COM)', byCom)}

${section('B — floremoria.eu (EU)', byEu)}

${section('C — Sito non determinato (UNKNOWN)', byUnk)}

## Dettaglio evidenza (tutti)

| Ordine | Sito | Gateway | Evidenza sito |
|--------|------|---------|---------------|
${rows
    .map(
        (r) =>
            `| \`${r.orderNumber}\` | ${r.site} | ${r.gateway} | ${r.siteEvidence.replace(/\|/g, '/')} |`
    )
    .join('\n')}

## Charge Stripe EU senza ordine Order abbinato

Queste sono incassi sull’account **EU** presenti in \`stripe_finance_movements\` che non risultano collegati a un \`Order\` (o non matchati in questo export). Utile per capire gap .eu → Neon.

| Data | Importo | Tipo | stripeId | Descrizione |
|------|---------|------|----------|-------------|
${
    orphanEu.length
        ? orphanEu
              .slice(0, 80)
              .map(
                  (o) =>
                      `| ${o.date} | ${o.amount} | ${o.type} | \`${o.stripeId.replace('stripe_eu_tx_', '')}\` | ${o.description.replace(/\|/g, '/')} |`
              )
              .join('\n')
        : '| — | — | — | — | nessuno |'
}
${orphanEu.length > 80 ? `\n_… e altre ${orphanEu.length - 80} righe (vedi JSON)._\n` : ''}

## Allegati

- CSV completo: [\`elenco_ordini_com_eu_pagamenti.csv\`](./elenco_ordini_com_eu_pagamenti.csv)
- JSON: [\`elenco_ordini_com_eu_pagamenti.json\`](./elenco_ordini_com_eu_pagamenti.json)
- Rigenera: \`npx tsx scripts/export-orders-com-eu.ts\`

## Limiti noti

1. \`Order\` non ha campo \`site\`/\`domain\`: la classificazione è **derivata**.
2. Molti ordini .eu storici sono PAID ma senza \`paymentMethodLabel\` / \`stripeTransactionId\` → gateway «Non registrato»; il sito EU si ricava da lista titolare o charge.
3. «PayPal (Stripe)» è pagamento **su Stripe COM** con wallet PayPal, non PayPal standalone.
`;

    fs.writeFileSync(mdPath, md, 'utf8');
    fs.writeFileSync(csvPath, csvLines.join('\n'), 'utf8');
    fs.writeFileSync(
        jsonPath,
        JSON.stringify(
            {
                generatedAt: new Date().toISOString(),
                counters,
                stripeCounts: { comCharges: comCharges.length, euCharges: euCharges.length },
                orphanEu,
                rows,
            },
            null,
            2
        ),
        'utf8'
    );

    console.log(
        JSON.stringify(
            {
                mdPath,
                csvPath,
                counters,
                stripeCounts: { com: comCharges.length, eu: euCharges.length },
                orphanEu: orphanEu.length,
                sampleEu: byEu.slice(0, 8).map((r) => `${r.orderNumber} ${r.buyer} ${r.gateway}`),
                sampleCom: byCom.slice(0, 8).map((r) => `${r.orderNumber} ${r.gateway}`),
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
