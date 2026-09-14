/**
 * Elenco ordini eseguiti Q2 2026 (1/4–30/6) .com + .eu
 * + vendite .eu non contabilizzate (lista titolare).
 * Uso: npx tsx scripts/export-ordini-q2-2026-com-eu.ts
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

/** Vendite .eu segnalate dal titolare e NON (ancora) a libro Order / CE. */
const EU_NON_CONTABILIZZATI: Array<{ date: string; customer: string; euros: string }> = [
    { date: '2026-06-16', customer: 'Rosetta Paladino', euros: '49,46' },
    { date: '2026-06-05', customer: 'cyrille magali Maman-Sernaglia', euros: '89,99' },
    { date: '2026-05-25', customer: 'Petra Manakova', euros: '84,98' },
    { date: '2026-05-16', customer: 'Maria Puliafico', euros: '49,99' },
    { date: '2026-05-03', customer: 'Maria ANTONIA Pozzi', euros: '53,48' },
    { date: '2026-05-03', customer: 'Isabella Cesaroni', euros: '299,90' },
    { date: '2026-04-29', customer: 'Rosetta Paladino', euros: '45,97' },
    { date: '2026-04-28', customer: 'Silvia Tregnaghi', euros: '54,98' },
    { date: '2026-04-27', customer: 'Famiglia Deotti-Buzzi', euros: '39,99' },
    { date: '2026-04-20', customer: "LUCIANO MAMMI'", euros: '59,98' },
    { date: '2026-04-20', customer: 'Elena Lombardi', euros: '39,99' },
    { date: '2026-04-16', customer: 'Rosaria Di Pasquale', euros: '29,99' },
    { date: '2026-04-01', customer: 'Cristiano Mariani', euros: '29,99' },
    { date: '2026-03-31', customer: 'FRANCESCO REDIVO', euros: '144,98' },
    { date: '2026-03-29', customer: 'Agostino Buttignol', euros: '29,99' },
    { date: '2026-03-24', customer: "LUCIANO MAMMI'", euros: '29,99' },
    { date: '2026-03-22', customer: "LUCIANO MAMMI'", euros: '29,99' },
    { date: '2026-03-19', customer: 'Silvia Tregnaghi', euros: '34,99' },
    { date: '2026-03-18', customer: "L'alternativa srl", euros: '39,99' },
    { date: '2026-03-14', customer: 'Chiara Durì', euros: '72,48' },
    { date: '2026-03-14', customer: 'Rosetta Paladino', euros: '69,98' },
    { date: '2026-03-13', customer: 'Maria Puliafico', euros: '49,99' },
    { date: '2026-03-01', customer: 'Mimma Congedo', euros: '144,98' },
    { date: '2026-02-26', customer: 'Norm Marchi', euros: '39,99' },
    { date: '2026-02-25', customer: 'Moreno Venturino', euros: '29,99' },
    { date: '2026-02-22', customer: "LUCIANO MAMMI'", euros: '29,99' },
    { date: '2026-02-19', customer: 'Luigina Dereani', euros: '39,99' },
    { date: '2026-02-16', customer: "LUCIANO MAMMI'", euros: '29,99' },
    { date: '2026-02-10', customer: 'Ester Irace', euros: '39,99' },
    { date: '2026-01-22', customer: 'Luciano Mammì', euros: '29,99' },
    { date: '2026-01-22', customer: 'Rosetta Paladino', euros: '40,97' },
    { date: '2026-01-21', customer: 'Luciano Mammì', euros: '29,99' },
    { date: '2026-01-20', customer: 'Sconosciuto', euros: '39,99' },
    { date: '2026-01-16', customer: 'Giulia Grappone', euros: '39,99' },
];

function parseEuroIt(s: string): number {
    return Math.round(parseFloat(s.replace(/\./g, '').replace(',', '.')) * 100);
}

function euroFromCents(cents: number) {
    return (cents / 100).toLocaleString('it-IT', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
    });
}

function euroIt(cents: number) {
    return (cents / 100).toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function dateIt(iso: string) {
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
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
    if (/sconosciuto|senza nome/i.test(a) || /sconosciuto|senza nome/i.test(b)) return 0;
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
    const jaccard = inter / new Set([...setA, ...setB]).size;
    if (na.includes(nb) || nb.includes(na)) return Math.max(jaccard, 0.85);
    return jaccard;
}

function classifyGateway(label: string | null, tx: string | null): string {
    const low = (label || '').toLowerCase();
    if (low.includes('test_mock')) return 'Test mock';
    if (low.includes('paypal') && low.includes('stripe')) return 'Stripe · PayPal (wallet)';
    if (low.includes('paypal')) return 'PayPal';
    if (low.includes('carta') || low.includes('card')) return 'Stripe · Carta';
    if (low.includes('apple')) return 'Stripe · Apple Pay';
    if (low.includes('google')) return 'Stripe · Google Pay';
    if (tx) return label ? `Stripe · ${label}` : 'Stripe (id presente)';
    if (label) return label;
    return 'Non registrato';
}

type Site = 'COM' | 'EU' | 'UNKNOWN';

async function main() {
    const from = new Date('2026-04-01T00:00:00.000Z');
    const to = new Date('2026-06-30T23:59:59.999Z');

    // Ordini "eseguiti": non cancellati, non test, creati nel periodo, preferibilmente PAID o stati operativi
    const orders = await prisma.order.findMany({
        where: {
            deletedAt: null,
            isTest: false,
            createdAt: { gte: from, lte: to },
        },
        select: {
            id: true,
            orderNumber: true,
            status: true,
            partnerPaymentStatus: true,
            paymentMethodLabel: true,
            stripeTransactionId: true,
            totalPriceCents: true,
            grossAmount: true,
            createdAt: true,
            deliveryDate: true,
            buyerFullName: true,
            buyerEmail: true,
            customerPhone: true,
            buyerCity: true,
            buyerCountry: true,
            deceasedName: true,
            cemeteryName: true,
            cemeteryCity: true,
            deliveryProvince: true,
            agencyName: true,
            partnershipChannel: true,
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
            amountCents: true,
            createdAtStripe: true,
            orderId: true,
            sourceId: true,
            metadataJson: true,
        },
    });

    const byOrderId = new Map<string, Site>();
    const byTxn = new Map<string, Site>();
    for (const m of stripeMovs) {
        const site: Site = m.stripeId.startsWith('stripe_eu_') ? 'EU' : 'COM';
        if (m.orderId) byOrderId.set(m.orderId, site);
        for (const raw of [m.stripeId, m.sourceId || '']) {
            const hit = String(raw).match(/(txn_|pi_|ch_|py_)[A-Za-z0-9]+/);
            if (hit) byTxn.set(hit[0], site);
        }
    }

    // Lista EU non contabilizzati: marca quelli che coincidono con un Order in Neon (stesso nome+importo±2€ ±5gg)
    type Missing = {
        date: string;
        customer: string;
        euros: string;
        cents: number;
        inQ2: boolean;
        matchedOrderNumber: string | null;
        note: string;
    };

    const allOrdersForMatch = await prisma.order.findMany({
        where: { deletedAt: null, isTest: false },
        select: {
            orderNumber: true,
            buyerFullName: true,
            totalPriceCents: true,
            createdAt: true,
        },
    });

    const missing: Missing[] = EU_NON_CONTABILIZZATI.map((row) => {
        const cents = parseEuroIt(row.euros);
        const inQ2 = row.date >= '2026-04-01' && row.date <= '2026-06-30';
        let matched: string | null = null;
        for (const o of allOrdersForMatch) {
            if (Math.abs(o.totalPriceCents - cents) > 2) continue;
            const dayDiff =
                Math.abs(
                    Date.parse(row.date + 'T12:00:00Z') -
                        Date.parse(o.createdAt.toISOString().slice(0, 10) + 'T12:00:00Z')
                ) / 86400000;
            if (dayDiff > 5) continue;
            if (nameScore(o.buyerFullName || '', row.customer) < 0.72) continue;
            matched = o.orderNumber || o.createdAt.toISOString().slice(0, 10);
            break;
        }
        return {
            date: row.date,
            customer: row.customer,
            euros: row.euros,
            cents,
            inQ2,
            matchedOrderNumber: matched,
            note: matched
                ? `Possibile match Order ${matched} — verificare se è davvero «non contabilizzato»`
                : 'Assente / non abbinato a Order Neon',
        };
    });

    type Row = {
        fonte: string;
        periodo: string;
        data: string;
        sito: string;
        orderNumber: string;
        statoOrdine: string;
        statoPagamento: string;
        gateway: string;
        importoEuro: string;
        importoCents: number;
        acquirente: string;
        email: string;
        telefono: string;
        cittaAcquirente: string;
        paese: string;
        defunto: string;
        cimitero: string;
        cittaConsegna: string;
        prodotti: string;
        fiorista: string;
        agenzia: string;
        note: string;
    };

    const rows: Row[] = [];

    for (const o of orders) {
        let sito: Site = byOrderId.get(o.id) || 'UNKNOWN';
        let sitoNote = '';
        if (sito === 'UNKNOWN' && o.stripeTransactionId) {
            sito = byTxn.get(o.stripeTransactionId) || 'UNKNOWN';
            if (sito === 'UNKNOWN') {
                for (const [k, v] of byTxn) {
                    if (o.stripeTransactionId.includes(k) || k.includes(o.stripeTransactionId)) {
                        sito = v;
                        break;
                    }
                }
            }
            if (sito === 'UNKNOWN') {
                sito = 'COM';
                sitoNote = 'sito COM: stripeTransactionId presente senza match EU';
            } else {
                sitoNote = `sito da StripeFinanceMovement (${sito})`;
            }
        }

        // Match puntuale lista .eu non contabilizzati (nome+importo+data)
        const missHit = missing.find(
            (m) =>
                m.matchedOrderNumber === o.orderNumber ||
                (nameScore(o.buyerFullName || '', m.customer) >= 0.85 &&
                    Math.abs(m.cents - o.totalPriceCents) <= 2 &&
                    Math.abs(
                        Date.parse(m.date + 'T12:00:00Z') -
                            Date.parse(o.createdAt.toISOString().slice(0, 10) + 'T12:00:00Z')
                    ) /
                        86400000 <=
                        5)
        );
        if (missHit && sito === 'UNKNOWN') {
            sito = 'EU';
            sitoNote = `sito EU: match lista titolare ${missHit.date}`;
        }

        // Cliente già presente in lista .eu titolare (stesso acquirente ricorrente)
        if (sito === 'UNKNOWN') {
            const knownEuBuyer = EU_NON_CONTABILIZZATI.find(
                (m) => nameScore(o.buyerFullName || '', m.customer) >= 0.9
            );
            if (knownEuBuyer) {
                sito = 'EU';
                sitoNote = `sito EU: acquirente presente in lista .eu («${knownEuBuyer.customer}»)`;
            }
        }

        const prodotti = o.items
            .map((i) => `${i.quantity}× ${i.product?.name || '?'}`)
            .join('; ');

        rows.push({
            fonte: 'Order Neon (eseguito Q2)',
            periodo: 'Q2 2026',
            data: o.createdAt.toISOString().slice(0, 10),
            sito,
            orderNumber: o.orderNumber || o.id.slice(0, 12),
            statoOrdine: String(o.status),
            statoPagamento: String(o.partnerPaymentStatus),
            gateway: classifyGateway(o.paymentMethodLabel, o.stripeTransactionId),
            importoEuro: euroIt(o.totalPriceCents),
            importoCents: o.totalPriceCents,
            acquirente: o.buyerFullName || '—',
            email: o.buyerEmail || '—',
            telefono: o.customerPhone || '—',
            cittaAcquirente: o.buyerCity || '—',
            paese: o.buyerCountry || '—',
            defunto: o.deceasedName || '—',
            cimitero: o.cemeteryName || '—',
            cittaConsegna: [o.cemeteryCity, o.deliveryProvince].filter(Boolean).join(' ') || '—',
            prodotti: prodotti || '—',
            fiorista: o.partner?.shopName || o.partner?.ownerName || '—',
            agenzia: o.agencyName || o.partnershipChannel || '—',
            note: [sitoNote, missHit ? `Anche in lista .eu titolare (${missHit.note})` : '']
                .filter(Boolean)
                .join(' · '),
        });
    }

    // Aggiungi TUTTE le righe .eu non contabilizzate (anche fuori Q2), come richiesto
    for (const m of missing) {
        rows.push({
            fonte: 'Lista .eu non contabilizzata (titolare)',
            periodo: m.inQ2 ? 'Q2 2026 (in periodo)' : 'Fuori Q2 (aggiunta)',
            data: m.date,
            sito: 'EU',
            orderNumber: m.matchedOrderNumber ? `(poss. ${m.matchedOrderNumber})` : '—',
            statoOrdine: '—',
            statoPagamento: '—',
            gateway: 'Stripe EU (non in Order / non a CE)',
            importoEuro: m.euros,
            importoCents: m.cents,
            acquirente: m.customer,
            email: '—',
            telefono: '—',
            cittaAcquirente: '—',
            paese: '—',
            defunto: '—',
            cimitero: '—',
            cittaConsegna: '—',
            prodotti: '—',
            fiorista: '—',
            agenzia: '—',
            note: m.note,
        });
    }

    // Ordina: prima Neon Q2 per data, poi missing per data
    rows.sort((a, b) => {
        const fa = a.fonte.startsWith('Order') ? 0 : 1;
        const fb = b.fonte.startsWith('Order') ? 0 : 1;
        if (fa !== fb) return fa - fb;
        return a.data.localeCompare(b.data) || a.acquirente.localeCompare(b.acquirente);
    });

    const neon = rows.filter((r) => r.fonte.startsWith('Order'));
    const miss = rows.filter((r) => !r.fonte.startsWith('Order'));
    const neonCom = neon.filter((r) => r.sito === 'COM');
    const neonEu = neon.filter((r) => r.sito === 'EU');
    const neonUnk = neon.filter((r) => r.sito === 'UNKNOWN');
    const missQ2 = miss.filter((r) => r.periodo.includes('in periodo'));
    const missOut = miss.filter((r) => r.periodo.includes('Fuori'));

    const sum = (list: Row[]) => list.reduce((s, r) => s + r.importoCents, 0);

    const outDir = path.join(process.cwd(), 'docs/verbali');
    const csvPath = path.join(outDir, 'elenco_ordini_Q2_2026_com_eu.csv');
    const mdPath = path.join(outDir, 'elenco_ordini_Q2_2026_com_eu.md');

    const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    const headers = [
        'fonte',
        'periodo',
        'data',
        'data_it',
        'sito',
        'orderNumber',
        'statoOrdine',
        'statoPagamento',
        'gateway',
        'importo_euro',
        'acquirente',
        'email',
        'telefono',
        'citta_acquirente',
        'paese',
        'defunto',
        'cimitero',
        'citta_consegna',
        'prodotti',
        'fiorista',
        'agenzia',
        'note',
    ];
    const csv = [
        headers.join(','),
        ...rows.map((r) =>
            [
                r.fonte,
                r.periodo,
                r.data,
                dateIt(r.data),
                r.sito,
                r.orderNumber,
                r.statoOrdine,
                r.statoPagamento,
                r.gateway,
                r.importoEuro,
                r.acquirente,
                r.email,
                r.telefono,
                r.cittaAcquirente,
                r.paese,
                r.defunto,
                r.cimitero,
                r.cittaConsegna,
                r.prodotti,
                r.fiorista,
                r.agenzia,
                r.note,
            ]
                .map(esc)
                .join(',')
        ),
    ].join('\n');

    function table(list: Row[], cols: 'full' | 'short' = 'short') {
        if (!list.length) return '_Nessuna riga._\n';
        if (cols === 'short') {
            return (
                `| Data | Sito | Ordine | Acquirente | Email | Importo | Gateway / note |\n` +
                `|------|------|--------|------------|-------|---------|----------------|\n` +
                list
                    .map((r) => {
                        const note = r.note ? ` · ${r.note}` : '';
                        return `| ${dateIt(r.data)} | ${r.sito} | ${r.orderNumber} | ${r.acquirente.replace(/\|/g, '/')} | ${r.email} | ${r.importoEuro} € | ${r.gateway}${note} |`;
                    })
                    .join('\n') +
                '\n'
            );
        }
        return table(list, 'short');
    }

    const md = `# Ordini eseguiti 01/04/2026 – 30/06/2026 (.com + .eu)  
## + vendite .eu non contabilizzate (lista titolare)

**Generato:** ${new Date().toISOString()}  
**Criterio Neon:** \`Order\` non cancellati, non test, \`createdAt\` tra 2026-04-01 e 2026-06-30.  
**Sito:** COM = Stripe floremoria.com · EU = Stripe floremoria.eu / lista titolare.

---

## Riepilogo

| Blocco | N | Totale |
|--------|---|--------|
| Ordini Neon in Q2 | **${neon.length}** | **${euroFromCents(sum(neon))}** |
| — di cui sito COM | ${neonCom.length} | ${euroFromCents(sum(neonCom))} |
| — di cui sito EU | ${neonEu.length} | ${euroFromCents(sum(neonEu))} |
| — di cui sito UNKNOWN | ${neonUnk.length} | ${euroFromCents(sum(neonUnk))} |
| Lista .eu non contabilizzata (tutte le date che hai passato) | **${miss.length}** | **${euroFromCents(sum(miss))}** |
| — di cui cadono in Q2 (1/4–30/6) | ${missQ2.length} | ${euroFromCents(sum(missQ2))} |
| — di cui fuori Q2 (gen–mar, incluse perché le hai elencate) | ${missOut.length} | ${euroFromCents(sum(missOut))} |

> Scarica il CSV per Excel: \`docs/verbali/elenco_ordini_Q2_2026_com_eu.csv\`

---

## 1) Ordini eseguiti in Neon — Q2 2026

### 1a · floremoria.com (COM)

${table(neonCom)}

### 1b · floremoria.eu (EU) già in Neon

${table(neonEu)}

### 1c · Sito non determinato (UNKNOWN) in Neon Q2

${table(neonUnk)}

---

## 2) Vendite .eu non contabilizzate (lista che hai passato)

Queste righe sono **incassi .eu** da riconciliare: non risultano (o non risultano chiaramente) a CE / Order completo.

### 2a · Cadono nel periodo 1/4–30/6

${table(missQ2)}

### 2b · Fuori periodo (gen–mar) — incluse perché le hai elencate

${table(missOut)}

---

## Note

1. Se una riga della lista titolare ha «Possibile match Order …», in Neon esiste già un ordine simile (nome/importo/data): va verificato a mano se è lo stesso incasso o un falso positivo.
2. I dati utente (email, telefono, città) sono disponibili solo per le righe da Neon; la lista .eu non contabilizzata ha solo data / nome / importo.
3. Rigenera: \`npx tsx scripts/export-ordini-q2-2026-com-eu.ts\`
`;

    fs.writeFileSync(csvPath, csv, 'utf8');
    fs.writeFileSync(mdPath, md, 'utf8');
    fs.writeFileSync(
        path.join(outDir, 'elenco_ordini_Q2_2026_com_eu.json'),
        JSON.stringify({ generatedAt: new Date().toISOString(), neon, missing: miss, rows }, null, 2),
        'utf8'
    );

    console.log(
        JSON.stringify(
            {
                csvPath,
                mdPath,
                neon: neon.length,
                neonCom: neonCom.length,
                neonEu: neonEu.length,
                neonUnk: neonUnk.length,
                miss: miss.length,
                missQ2: missQ2.length,
                sumNeon: euroFromCents(sum(neon)),
                sumMiss: euroFromCents(sum(miss)),
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
