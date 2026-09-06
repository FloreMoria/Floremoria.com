/**
 * Fase 4b — Indagine PRE-LOTTO 3 (sola lettura).
 * Contesto: dual-site .com/.eu, PayPal come incasso + pagamento.
 *
 * Uso: npx tsx scripts/fase4b-pre-lotto3-investigation.ts
 * VIETATO: qualsiasi write.
 */
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import prisma from '../lib/prisma';

function euro(cents: number): string {
    return (cents / 100).toLocaleString('it-IT', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
    });
}

function day(d: Date | null | undefined): string {
    if (!d) return '—';
    return d.toISOString().slice(0, 10);
}

const COST_CATS = [
    'SPESE_OPERATIVE',
    'ALTRI_COSTI',
    'SPESE_SAAS',
    'ONERI_BANCARI',
    'CONSULENZE',
    'IMPOSTE',
    'COSTI_FIORISTI',
];

function isPaypalOutboundDesc(u: string): boolean {
    return /PAYPAL/.test(u) && !/STRIPE/.test(u);
}
function isStripeOutboundDesc(u: string): boolean {
    return /STRIPE/.test(u);
}

async function sectionA() {
    // Schema: no dedicated site/domain field on Order
    const orderColumns = await prisma.$queryRaw<Array<{ column_name: string }>>`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'Order' OR table_name = 'orders'
        ORDER BY ordinal_position
    `;

    const totalOrders = await prisma.order.count({ where: { deletedAt: null } });
    const withEuHints = await prisma.order.findMany({
        where: {
            deletedAt: null,
            OR: [
                { buyerEmail: { contains: '.eu', mode: 'insensitive' } },
                { buyerCountry: { contains: 'eu', mode: 'insensitive' } },
                { partnershipChannel: { contains: 'eu', mode: 'insensitive' } },
                { partnershipChannel: { contains: 'wix', mode: 'insensitive' } },
                { partnershipChannel: { contains: 'psa', mode: 'insensitive' } },
                { financeNotes: { contains: '.eu', mode: 'insensitive' } },
                { financeNotes: { contains: 'wix', mode: 'insensitive' } },
                { orderNumber: { contains: 'EU', mode: 'insensitive' } },
                { stripeTransactionId: { startsWith: 'stripe_eu_' } },
                { stripeTransactionId: { contains: 'eu' } },
            ],
        },
        select: {
            id: true,
            orderNumber: true,
            totalPriceCents: true,
            createdAt: true,
            partnershipChannel: true,
            paymentMethodLabel: true,
            stripeTransactionId: true,
            buyerEmail: true,
            buyerCountry: true,
            financeNotes: true,
        },
        take: 50,
    });

    const channels = await prisma.order.groupBy({
        by: ['partnershipChannel'],
        where: { deletedAt: null },
        _count: true,
        _sum: { totalPriceCents: true },
    });

    const paymentMethods = await prisma.order.groupBy({
        by: ['paymentMethodLabel'],
        where: { deletedAt: null },
        _count: true,
        _sum: { totalPriceCents: true },
    });

    // Stripe movements: COM vs EU prefixes
    const stripeAll = await prisma.stripeFinanceMovement.findMany({
        select: { stripeId: true, amountCents: true, type: true, orderId: true, createdAtStripe: true },
    });
    let euN = 0,
        euCents = 0,
        comN = 0,
        comCents = 0,
        euWithOrder = 0,
        euWithoutOrder = 0;
    const euTypes: Record<string, { n: number; cents: number }> = {};
    for (const m of stripeAll) {
        const isEu = m.stripeId.startsWith('stripe_eu_');
        if (isEu) {
            euN++;
            euCents += m.amountCents;
            if (m.orderId) euWithOrder++;
            else euWithoutOrder++;
            const t = m.type || 'unknown';
            if (!euTypes[t]) euTypes[t] = { n: 0, cents: 0 };
            euTypes[t].n++;
            euTypes[t].cents += m.amountCents;
        } else {
            comN++;
            comCents += m.amountCents;
        }
    }

    // Ledger mentions Wix / .eu
    const ledgerEu = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            OR: [
                { description: { contains: 'Wix', mode: 'insensitive' } },
                { description: { contains: 'Adyen', mode: 'insensitive' } },
                { description: { contains: '.eu', mode: 'insensitive' } },
                { description: { contains: 'floremoria.eu', mode: 'insensitive' } },
            ],
        },
        select: {
            id: true,
            category: true,
            totalCents: true,
            accountingDate: true,
            description: true,
            sourceType: true,
        },
    });

    const euKeyConfigured = Boolean(
        process.env.STRIPE_EU_SECRET_KEY?.trim() ||
            process.env.STRIPE_SECRET_KEY_EU?.trim() ||
            process.env.STRIPE_PSA_SECRET_KEY?.trim()
    );

    return {
        schemaHasSiteDomainField: orderColumns.some((c) =>
            /domain|site|storefront|origin|wix|locale_shop/i.test(c.column_name)
        ),
        orderColumnNamesSample: orderColumns.map((c) => c.column_name).filter((n) =>
            /partner|channel|stripe|payment|email|country|note|source|domain|site/i.test(n)
        ),
        totalOrdersActive: totalOrders,
        ordersWithEuHeuristicHints: {
            count: withEuHints.length,
            note: 'Heuristic only — buyerEmail containing .eu ≠ order from floremoria.eu',
            sample: withEuHints.slice(0, 10).map((o) => ({
                orderNumber: o.orderNumber,
                euro: euro(o.totalPriceCents),
                channel: o.partnershipChannel,
                pay: o.paymentMethodLabel,
                stripeTx: o.stripeTransactionId,
                email: o.buyerEmail,
                country: o.buyerCountry,
            })),
            sumCents: withEuHints.reduce((s, o) => s + o.totalPriceCents, 0),
        },
        partnershipChannels: channels.map((c) => ({
            channel: c.partnershipChannel,
            n: c._count,
            euro: euro(c._sum.totalPriceCents || 0),
        })),
        paymentMethods: paymentMethods.map((c) => ({
            method: c.paymentMethodLabel,
            n: c._count,
            euro: euro(c._sum.totalPriceCents || 0),
        })),
        stripeMovements: {
            euKeyConfigured,
            com: { n: comN, sumAmountSigned: euro(comCents) },
            eu: {
                n: euN,
                sumAmountSigned: euro(euCents),
                withOrderId: euWithOrder,
                withoutOrderId: euWithoutOrder,
                byType: Object.fromEntries(
                    Object.entries(euTypes).map(([k, v]) => [k, { n: v.n, euro: euro(v.cents) }])
                ),
            },
        },
        ledgerWixAdyenEuMentions: ledgerEu.map((r) => ({
            id: r.id,
            date: day(r.accountingDate),
            cat: r.category,
            euro: euro(r.totalCents),
            source: r.sourceType,
            desc: r.description.slice(0, 100),
        })),
        verdict:
            euN === 0 && withEuHints.filter((o) => o.stripeTransactionId?.startsWith('stripe_eu_')).length === 0
                ? 'NO_EU_ORDERS_IN_DB'
                : euN > 0
                  ? 'STRIPE_EU_MOVEMENTS_PRESENT_CHECK_ORDER_LINK'
                  : 'HEURISTIC_ONLY_NO_DEDICATED_EU_ORDERS',
    };
}

async function sectionB() {
    const bankOut = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceType: 'BANK_LINE',
            OR: [{ direction: 'USCITA' }, { totalCents: { lt: 0 } }],
        },
        select: {
            id: true,
            category: true,
            totalCents: true,
            accountingDate: true,
            description: true,
            bankLineId: true,
            sourceId: true,
            sourceKey: true,
            metadataJson: true,
        },
        orderBy: { accountingDate: 'asc' },
    });

    const toPaypal: typeof bankOut = [];
    const toStripe: typeof bankOut = [];

    for (const r of bankOut) {
        const u = r.description.toUpperCase();
        const meta =
            r.metadataJson && typeof r.metadataJson === 'object' && !Array.isArray(r.metadataJson)
                ? (r.metadataJson as Record<string, unknown>)
                : {};
        const matchType = String(meta.matchType || '');
        const isCostLike =
            COST_CATS.includes(r.category) ||
            matchType === 'CASH_EXPENSE' ||
            /CASH_EXPENSE|SPESE|COSTO/.test(matchType);

        // Include all outbound to PP/Stripe classified as cost OR still as cost category
        if (!isCostLike && r.category === 'TRASFERIMENTO_INTERNO') continue;

        if (isPaypalOutboundDesc(u) && (isCostLike || COST_CATS.includes(r.category))) {
            toPaypal.push(r);
        } else if (isStripeOutboundDesc(u) && (isCostLike || COST_CATS.includes(r.category))) {
            toStripe.push(r);
        } else if (isPaypalOutboundDesc(u) && COST_CATS.includes(r.category)) {
            toPaypal.push(r);
        }
    }

    // Broader: ANY Fineco outbound to PayPal/Stripe regardless of category (for transparency)
    const anyToPaypal = bankOut.filter((r) => isPaypalOutboundDesc(r.description.toUpperCase()));
    const anyToStripe = bankOut.filter((r) => isStripeOutboundDesc(r.description.toUpperCase()));

    const sum = (rows: typeof bankOut) => rows.reduce((s, r) => s + Math.abs(r.totalCents), 0);

    const gapPaypal = 156_830;

    return {
        costClassified: {
            finecoToPaypal: {
                n: toPaypal.length,
                total: euro(sum(toPaypal)),
                cents: sum(toPaypal),
                rows: toPaypal.map((r) => ({
                    id: r.id,
                    date: day(r.accountingDate),
                    cat: r.category,
                    euro: euro(r.totalCents),
                    desc: r.description.slice(0, 120),
                })),
            },
            finecoToStripe: {
                n: toStripe.length,
                total: euro(sum(toStripe)),
                cents: sum(toStripe),
                rows: toStripe.map((r) => ({
                    id: r.id,
                    date: day(r.accountingDate),
                    cat: r.category,
                    euro: euro(r.totalCents),
                    desc: r.description.slice(0, 120),
                })),
            },
        },
        allCategoriesOutbound: {
            finecoToPaypal: {
                n: anyToPaypal.length,
                byCategory: summarizeByCat(anyToPaypal),
                totalAbs: euro(sum(anyToPaypal)),
                cents: sum(anyToPaypal),
            },
            finecoToStripe: {
                n: anyToStripe.length,
                byCategory: summarizeByCat(anyToStripe),
                totalAbs: euro(sum(anyToStripe)),
                cents: sum(anyToStripe),
            },
        },
        compareToPaypalGap: {
            gap: euro(gapPaypal),
            costClassifiedToPaypal: euro(sum(toPaypal)),
            coversGap: sum(toPaypal) >= gapPaypal,
            residualIfReclassed: euro(gapPaypal - sum(toPaypal)),
        },
    };
}

function summarizeByCat(rows: Array<{ category: string; totalCents: number }>) {
    const m: Record<string, { n: number; cents: number }> = {};
    for (const r of rows) {
        if (!m[r.category]) m[r.category] = { n: 0, cents: 0 };
        m[r.category].n++;
        m[r.category].cents += Math.abs(r.totalCents);
    }
    return Object.fromEntries(
        Object.entries(m).map(([k, v]) => [k, { n: v.n, euro: euro(v.cents), cents: v.cents }])
    );
}

async function sectionC() {
    const pp = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceType: 'PAYPAL_MOVEMENT',
        },
        select: {
            id: true,
            category: true,
            direction: true,
            totalCents: true,
            netCents: true,
            description: true,
            accountingDate: true,
            metadataJson: true,
            counterpartyName: true,
        },
    });

    const credits = pp.filter((r) => r.direction === 'ENTRATA' || r.totalCents > 0);
    const debits = pp.filter((r) => r.direction === 'USCITA' || r.totalCents < 0);

    const creditSum = credits.reduce((s, r) => s + Math.abs(r.totalCents), 0);
    const debitSum = debits.reduce((s, r) => s + Math.abs(r.totalCents), 0);

    // Classify debits
    type Bucket = 'PAYOUT_TO_FINECO' | 'SUPPLIER_EXPENSE' | 'FEE_COMMISSION' | 'REFUND_OR_OTHER' | 'UNKNOWN';
    const buckets: Record<Bucket, { n: number; cents: number; samples: string[] }> = {
        PAYOUT_TO_FINECO: { n: 0, cents: 0, samples: [] },
        SUPPLIER_EXPENSE: { n: 0, cents: 0, samples: [] },
        FEE_COMMISSION: { n: 0, cents: 0, samples: [] },
        REFUND_OR_OTHER: { n: 0, cents: 0, samples: [] },
        UNKNOWN: { n: 0, cents: 0, samples: [] },
    };

    function classifyDebit(r: (typeof debits)[0]): Bucket {
        const u = `${r.description} ${r.counterpartyName || ''} ${r.category}`.toUpperCase();
        const meta =
            r.metadataJson && typeof r.metadataJson === 'object' && !Array.isArray(r.metadataJson)
                ? (r.metadataJson as Record<string, unknown>)
                : {};
        const eventType = String(meta.eventType || meta.paypalEventType || meta.type || '').toUpperCase();
        const blob = `${u} ${eventType}`;

        if (
            r.category === 'TRASFERIMENTO_INTERNO' ||
            r.category === 'PAYPAL_PAYOUT' ||
            /PAYOUT|WITHDRAW|TRASFER|FINECO|BANK|GIROCONTO/.test(blob)
        ) {
            return 'PAYOUT_TO_FINECO';
        }
        if (
            r.category === 'ONERI_BANCARI' ||
            /FEE|COMMISSION|COMMISSIONE|TRANSACTION_FEE|PAYMENT_FEE/.test(blob)
        ) {
            return 'FEE_COMMISSION';
        }
        if (
            COST_CATS.includes(r.category) ||
            /VENDOR|SUPPLIER|FORNITOR|CURSOR|VERCEL|OPENAI|ANTHROPIC|GOOGLE|META|AWS|SHOP|PURCHASE|PAYMENT.*TO|INVIO|BONIFICO/.test(
                blob
            )
        ) {
            return 'SUPPLIER_EXPENSE';
        }
        if (/REFUND|RIMBORSO|CHARGEBACK|STORNO/.test(blob) || r.category === 'RIMBORSI') {
            return 'REFUND_OR_OTHER';
        }
        // category SPESE_* already caught; leftover by amount patterns
        if (['SPESE_OPERATIVE', 'SPESE_SAAS', 'ALTRI_COSTI', 'CONSULENZE', 'IMPOSTE'].includes(r.category)) {
            return 'SUPPLIER_EXPENSE';
        }
        return 'UNKNOWN';
    }

    for (const r of debits) {
        const b = classifyDebit(r);
        buckets[b].n++;
        buckets[b].cents += Math.abs(r.totalCents);
        if (buckets[b].samples.length < 5) {
            buckets[b].samples.push(
                `${day(r.accountingDate)} ${euro(r.totalCents)} [${r.category}] ${r.description.slice(0, 80)}`
            );
        }
    }

    // Debits also booked as BANK_LINE costs (double-count risk)
    const bankCostPaypalLike = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceType: 'BANK_LINE',
            category: { in: COST_CATS },
            OR: [{ direction: 'USCITA' }, { totalCents: { lt: 0 } }],
            description: { contains: 'PayPal', mode: 'insensitive' },
        },
        select: {
            id: true,
            totalCents: true,
            category: true,
            accountingDate: true,
            description: true,
        },
    });

    // Category mix of all PayPal movements
    const byCatAll = summarizeByCat(pp);
    const byCatDebit = summarizeByCat(debits);
    const byCatCredit = summarizeByCat(credits);

    return {
        activeRows: pp.length,
        credits: { n: credits.length, euro: euro(creditSum), cents: creditSum },
        debits: { n: debits.length, euro: euro(debitSum), cents: debitSum },
        balance: euro(creditSum - debitSum),
        expectedDebitsFromFase4a: euro(325_125),
        debitBreakdown: Object.fromEntries(
            Object.entries(buckets).map(([k, v]) => [
                k,
                { n: v.n, euro: euro(v.cents), cents: v.cents, samples: v.samples },
            ])
        ),
        paypalMovementsByCategory: byCatAll,
        debitsByCategory: byCatDebit,
        creditsByCategory: byCatCredit,
        bankLineCostsThatLookLikePaypalFunding: {
            n: bankCostPaypalLike.length,
            euro: euro(bankCostPaypalLike.reduce((s, r) => s + Math.abs(r.totalCents), 0)),
            rows: bankCostPaypalLike.map((r) => ({
                id: r.id,
                date: day(r.accountingDate),
                cat: r.category,
                euro: euro(r.totalCents),
                desc: r.description.slice(0, 100),
            })),
            warning:
                'Se queste uscite Fineco→PayPal restano SPESE_* mentre PayPal paga i fornitori, il CE e il saldo Fineco sono sfalsati (doppia lettura costo / terzo gamba mancante sul transito).',
        },
    };
}

async function sectionD(a: Awaited<ReturnType<typeof sectionA>>, b: Awaited<ReturnType<typeof sectionB>>, c: Awaited<ReturnType<typeof sectionC>>) {
    const gap = 156_830; // €1.568,30
    const misclassifiedFunding = b.costClassified.finecoToPaypal.cents; // giroconti banca→PP come costo
    // Incassi senza ordine: PayPal credits without linkable order — approximate from credits in RICAVI that have no order
    // Plus Stripe EU without order; plus Wix €30.09 as known .eu cash
    const wixEuCents = 3_009;

    const ppCreditsNoOrder = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceType: 'PAYPAL_MOVEMENT',
            OR: [{ direction: 'ENTRATA' }, { totalCents: { gt: 0 } }],
            orderId: null,
            category: { in: ['RICAVI_VENDITE', 'ALTRI_RICAVI', 'RIMBORSI'] },
        },
        select: { totalCents: true },
    });
    const orphanPaypalCredits = ppCreditsNoOrder.reduce((s, r) => s + Math.abs(r.totalCents), 0);

    // Explained by misclassified Fineco→PP funding (reduces apparent PP deficit when reclassed to transit)
    const explainedByMisclassFunding = Math.min(misclassifiedFunding, gap);

    // .eu / orphan: does NOT automatically equal the PP gap (gap is balance = credits - debits).
    // Orphan credits INCREASE the credit side; if they're in the ledger they already affect balance.
    // The user's hypothesis: .eu sales arrived on Fineco via payout without Order — those show as
    // bank payouts (maybe as ricavi) not as PP balance hole. For PP gap specifically:
    // - funding misclassified as expense: when you fund PP from Fineco, debit leaves Fineco; if PP
    //   then pays suppliers, PP balance drops; the Fineco→PP should be transit in, not cost.
    //   Currently if Fineco→PP is cost and PP expenses are also recorded, you get double pain on CE
    //   and PP transit looks more negative.
    // Quote for .eu: cannot measure from this DB if orders missing — only known cash proof Wix €30.09
    // and any stripe_eu movements. Assign "unexplained by orders" slice separately.

    const stripeEuChargeCents = 0; // filled if we have charge types
    // From A: eu movements sum is signed; need charges only
    const euCharges = a.stripeMovements.eu.byType;

    let explainedByEuOrphanEstimate = wixEuCents; // minimum proven .eu cash on Fineco
    // Note: orphan PayPal credits without order may BE .eu or unmatched .com
    const orphanNote = orphanPaypalCredits;

    const explainedSum = explainedByMisclassFunding; // only hard euro against the gap mechanics
    const residual = gap - explainedByMisclassFunding;

    // Supplier payments from PayPal that are the "third leg"
    const supplierFromPp = (c.debitBreakdown as any).SUPPLIER_EXPENSE?.cents || 0;
    const payoutToFineco = (c.debitBreakdown as any).PAYOUT_TO_FINECO?.cents || 0;
    const fees = (c.debitBreakdown as any).FEE_COMMISSION?.cents || 0;

    return {
        gap: euro(gap),
        gapCents: gap,
        quote1_girocontiMalClassificati: {
            euro: euro(explainedByMisclassFunding),
            cents: explainedByMisclassFunding,
            note: 'Uscite Fineco→PayPal oggi in categorie costo (es. €500). Se riclassificate a transito, riducono il “buco” apparente sul modello (oggi gonfiano costi e non alimentano il transito).',
        },
        quote2_incassiSenzaOrdineEu: {
            provenCashEuOnFineco_wix: euro(wixEuCents),
            paypalCreditsWithoutOrderId: euro(orphanPaypalCredits),
            stripeEuMovementsInDb: a.stripeMovements.eu.n,
            stripeEuByType: euCharges,
            ordersFloremoriaEuInDb: a.verdict,
            note: 'Gli incassi .eu senza Order a libro NON si leggono come pezzo del saldo PAYPAL_MOVEMENT negativo in modo 1:1: spiegano piuttosto ricavi mancanti nelle vendite e payout Fineco senza ordine. Quota .eu sul gap PP: non misurabile da questo DB finché non c’è export ordini .eu. Minimo documentato a cassa: Wix/Adyen €30,09.',
            assignableToGapDirectly: euro(0),
            assignableCents: 0,
        },
        quote3_inspiegatoSulGap: {
            euro: euro(Math.max(0, residual)),
            cents: Math.max(0, residual),
            note: 'Residuo del gap −€1.568,30 dopo aver sottratto solo i giroconti Fineco→PP mal classificati come costo. Il resto è composizione uscite PP (fornitori + payout + fee) vs crediti sincronizzati — serve modello a 3 gambe.',
        },
        modelThirdLeg: {
            paypalDebitsSupplier: euro(supplierFromPp),
            paypalDebitsPayoutFineco: euro(payoutToFineco),
            paypalDebitsFees: euro(fees),
            implication:
                'PayPal non è solo raccolta→Fineco: paga anche fornitori. Il conto di transito deve avere: (1) incassi clienti, (2) payout→Fineco, (3) pagamenti fornitori. Senza la terza gamba il saldo non quadra per costruzione.',
        },
        salesImplication:
            a.verdict === 'NO_EU_ORDERS_IN_DB'
                ? 'Una parte del fatturato reale (.eu) non è nelle vendite caratteristiche del DB .com — le vendite PnL sono incomplete per costruzione fino a import/export .eu.'
                : 'Verificare link stripe_eu → Order.',
    };
}

function buildMarkdown(report: {
    generatedAt: string;
    a: Awaited<ReturnType<typeof sectionA>>;
    b: Awaited<ReturnType<typeof sectionB>>;
    c: Awaited<ReturnType<typeof sectionC>>;
    d: Awaited<ReturnType<typeof sectionD>>;
}): string {
    const { a, b, c, d } = report;
    return `# Fase 4b — Indagine PRE-LOTTO 3 (sola lettura)

**Generato:** ${report.generatedAt}  
**Vincolo:** ZERO scritture · ZERO commit  
**Contesto titolare:** siti \`.com\` + \`.eu\` attivi; payout gateway su Fineco; spese da Fineco **o** PayPal.

---

## ⚠️ URGENTE — Export floremoria.eu

Gli ordini \`.eu\` **non risultano** in questo database (vedi §A).  
Se floremoria.eu chiude questo mese e i dati vivono solo su Wix/hosting \`.eu\`, **dopo lo spegnimento non si ricostruiscono più** gli incassi Stripe/PayPal/Wix già arrivati su Fineco.

**Azione richiesta al titolare (fuori da questo script):** esportare SUBITO da Wix / pannello \`.eu\` / Stripe EU / PayPal — ordini, clienti, importi, date, riferimenti pagamento — e archiviarli (CSV/JSON anche grezzi). Cursor può solo leggere Neon \`.com\`: **non può recuperare ciò che non è mai stato importato**.

---

## A. Ordini floremoria.eu

| Domanda | Risposta |
|---------|----------|
| Campo dedicato sito/dominio su \`Order\`? | **NO** (${a.schemaHasSiteDomainField ? 'sì' : 'nessun campo domain/site/storefront'}) |
| Campi affini | ${a.orderColumnNamesSample.join(', ') || '—'} |
| Ordini attivi totali nel DB | ${a.totalOrdersActive} |
| Ordini con heuristic \`.eu\`/wix/psa | ${a.ordersWithEuHeuristicHints.count} (somma ${euro(a.ordersWithEuHeuristicHints.sumCents)} — **non** prova di origine \`.eu\`) |
| Movimenti \`stripe_eu_*\` in DB | **${a.stripeMovements.eu.n}** (chiave EU configurata in env: ${a.stripeMovements.euKeyConfigured ? 'sì' : '**no**'}) |
| Mentions ledger Wix/Adyen/\`.eu\` | ${a.ledgerWixAdyenEuMentions.length} righe (nota: include Wix €30,09) |

**Verdetto A:** \`${a.verdict}\`

${
    a.verdict === 'NO_EU_ORDERS_IN_DB' || a.stripeMovements.eu.n === 0
        ? `**Dichiarazione esplicita:** una parte degli incassi gateway (sito \`.eu\`) **non ha ordini a libro** in questo database. Le vendite caratteristiche del motore PnL (\`.com\`) sono **incomplete per costruzione** rispetto al fatturato reale societario finché non si importa/archivia \`.eu\`.`
        : 'Ci sono movimenti Stripe EU — verificare collegamento agli Order.'
}

### Canali partnership / metodi pagamento (tutti gli ordini)

\`\`\`
${JSON.stringify({ channels: a.partnershipChannels, paymentMethods: a.paymentMethods }, null, 2)}
\`\`\`

### Ledger Wix/Adyen

${a.ledgerWixAdyenEuMentions.map((r) => `- ${r.date} ${r.euro} [${r.cat}] ${r.desc}`).join('\n') || '_nessuna_'}

---

## B. Giroconti in uscita banca → gateway (classificati costo)

### Fineco → PayPal come costo

| Metrica | Valore |
|---------|--------|
| Righe | **${b.costClassified.finecoToPaypal.n}** |
| Totale | **${b.costClassified.finecoToPaypal.total}** |

${b.costClassified.finecoToPaypal.rows.map((r) => `- ${r.date} ${r.euro} [${r.cat}] ${r.desc}`).join('\n') || '_nessuna_'}

### Fineco → Stripe come costo

| Metrica | Valore |
|---------|--------|
| Righe | **${b.costClassified.finecoToStripe.n}** |
| Totale | **${b.costClassified.finecoToStripe.total}** |

${b.costClassified.finecoToStripe.rows.map((r) => `- ${r.date} ${r.euro} [${r.cat}] ${r.desc}`).join('\n') || '_nessuna_'}

### Tutte le uscite Fineco→PayPal (ogni categoria)

${JSON.stringify(b.allCategoriesOutbound.finecoToPaypal, null, 2)}

### Confronto col gap transito PayPal (−€1.568,30)

| | |
|--|--|
| Gap | ${b.compareToPaypalGap.gap} |
| Giroconti→PP classiti costo | ${b.compareToPaypalGap.costClassifiedToPaypal} |
| Residuo gap se si riclassificassero | ${b.compareToPaypalGap.residualIfReclassed} |

---

## C. Spese pagate da PayPal (uscite attive €3.251,25 attese)

| | Righe | Importo |
|--|-------|---------|
| Crediti \`PAYPAL_MOVEMENT\` | ${c.credits.n} | ${c.credits.euro} |
| Debiti \`PAYPAL_MOVEMENT\` | ${c.debits.n} | ${c.debits.euro} |
| Saldo (crediti − debiti) | | **${c.balance}** |

### Scomposizione debiti

| Bucket | Righe | Importo |
|--------|-------|---------|
| Payout verso Fineco | ${(c.debitBreakdown as any).PAYOUT_TO_FINECO.n} | ${(c.debitBreakdown as any).PAYOUT_TO_FINECO.euro} |
| Pagamenti fornitori / spese | ${(c.debitBreakdown as any).SUPPLIER_EXPENSE.n} | ${(c.debitBreakdown as any).SUPPLIER_EXPENSE.euro} |
| Commissioni | ${(c.debitBreakdown as any).FEE_COMMISSION.n} | ${(c.debitBreakdown as any).FEE_COMMISSION.euro} |
| Rimborsi / altro | ${(c.debitBreakdown as any).REFUND_OR_OTHER.n} | ${(c.debitBreakdown as any).REFUND_OR_OTHER.euro} |
| Non classificato | ${(c.debitBreakdown as any).UNKNOWN.n} | ${(c.debitBreakdown as any).UNKNOWN.euro} |

### Debiti per categoria ledger

\`\`\`
${JSON.stringify(c.debitsByCategory, null, 2)}
\`\`\`

### ⚠️ Uscite Fineco→PayPal ancora come costo banca

${c.bankLineCostsThatLookLikePaypalFunding.warning}

- Totale: **${c.bankLineCostsThatLookLikePaypalFunding.euro}** (${c.bankLineCostsThatLookLikePaypalFunding.n} righe)
${c.bankLineCostsThatLookLikePaypalFunding.rows.map((r) => `  - ${r.date} ${r.euro} [${r.cat}] ${r.desc}`).join('\n')}

---

## D. Ricomposizione gap PayPal −€1.568,30

| Quota | Euro | Nota |
|-------|------|------|
| **1. Giroconti mal classificati** (Fineco→PP come costo) | **${d.quote1_girocontiMalClassificati.euro}** | ${d.quote1_girocontiMalClassificati.note} |
| **2. Incassi senza ordine (.eu)** — quota **diretta** sul gap PP | **${d.quote2_incassiSenzaOrdineEu.assignableToGapDirectly}** | ${d.quote2_incassiSenzaOrdineEu.note} |
| **3. Inspiegato / composizione modello** | **${d.quote3_inspiegatoSulGap.euro}** | ${d.quote3_inspiegatoSulGap.note} |

### Evidenze collaterali (.eu / orfani)

| Voce | Valore |
|------|--------|
| Cassa \`.eu\` provata su Fineco (Wix) | ${d.quote2_incassiSenzaOrdineEu.provenCashEuOnFineco_wix} |
| Crediti PayPal senza \`orderId\` | ${d.quote2_incassiSenzaOrdineEu.paypalCreditsWithoutOrderId} |
| Movimenti Stripe EU in DB | ${d.quote2_incassiSenzaOrdineEu.stripeEuMovementsInDb} |
| Ordini \`.eu\` a libro | ${d.quote2_incassiSenzaOrdineEu.ordersFloremoriaEuInDb} |

### Terza gamba del modello

| Voce | Valore |
|------|--------|
| Uscite PP → fornitori | ${d.modelThirdLeg.paypalDebitsSupplier} |
| Uscite PP → payout Fineco | ${d.modelThirdLeg.paypalDebitsPayoutFineco} |
| Uscite PP → fee | ${d.modelThirdLeg.paypalDebitsFees} |

${d.modelThirdLeg.implication}

**Implicazione vendite:** ${d.salesImplication}

---

## STOP

Indagine conclusa. Nessuna mutazione. Nessun via libera Lotto 3 da questo report.  
Priorità operativa: **export \`.eu\` prima della chiusura del sito**.
`;
}

async function main() {
    console.log('[pre-l3] READ-ONLY investigation start');
    const a = await sectionA();
    const b = await sectionB();
    const c = await sectionC();
    const d = await sectionD(a, b, c);
    const generatedAt = new Date().toISOString();
    const report = { generatedAt, a, b, c, d };

    const outPath = path.join(process.cwd(), 'docs/verbali/dossier_fase4b_pre_lotto3_indagine.md');
    fs.writeFileSync(outPath, buildMarkdown(report), 'utf8');

    console.log(JSON.stringify(report, null, 2));
    console.log('[pre-l3] wrote', outPath);
}

main()
    .catch((err) => {
        console.error('[pre-l3] FATAL', err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
