/**
 * Approfondimento sola lettura: 13 bonifici F3 T1 + V2 per VAT partner + V3 delta lista.
 */
import fs from 'node:fs';
import prisma from '@/lib/prisma';
import { readFloristAlertMeta } from '@/lib/financial/floristMissingInvoices';
import { resolveQuarterBounds } from '@/lib/financial/taxQuarterly';
import { buildGatewayCorrispettivi } from '@/lib/financial/dossierCorrispettiviBuild';
import { normalizePassiveSupplierVat } from '@/lib/financial/passiveInvoiceIdentity';

function iso(d: Date | null | undefined): string | null {
    return d ? d.toISOString().slice(0, 10) : null;
}
function norm(s: string): string {
    return s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim();
}
function namesCompatible(a: string, b: string): boolean {
    const na = norm(a);
    const nb = norm(b);
    if (!na || !nb) return false;
    if (na.includes(nb) || nb.includes(na)) return true;
    return na.split(' ').filter((t) => t.length > 3).some((t) => nb.includes(t));
}

/** "55.99 €" / "1.234,56 €" → cents */
function parseEuroIt(s: string): number {
    const t = s.replace(/[€\s]/g, '').trim();
    if (!t) return 0;
    if (t.includes(',') && t.includes('.')) {
        // 1.234,56
        return Math.round(Number(t.replace(/\./g, '').replace(',', '.')) * 100);
    }
    if (t.includes(',')) {
        return Math.round(Number(t.replace(',', '.')) * 100);
    }
    // 55.99
    return Math.round(Number(t) * 100);
}

const F3_ROWS: Array<{ date: string; amt: number; hint: string; floristLabel: string }> = [
    { date: '2026-01-17', amt: 2500, hint: 'MASTRO', floristLabel: 'Mastro Fiori' },
    { date: '2026-01-26', amt: 2700, hint: 'CALAMUNCI', floristLabel: 'Calamunci Tindaro' },
    { date: '2026-01-30', amt: 4000, hint: 'SHOPPING', floristLabel: 'SHOPPINGARDEN di Anna Bruno' },
    { date: '2026-02-03', amt: 2500, hint: 'BATTISTELLA', floristLabel: 'Fioreria Battistella s.r.l.' },
    { date: '2026-02-17', amt: 4000, hint: 'REGGIO', floristLabel: 'Fioreria Reggio Calabria' },
    { date: '2026-02-24', amt: 2000, hint: 'MAG', floristLabel: 'MAG Flowers' },
    { date: '2026-02-24', amt: 2500, hint: 'STINGA', floristLabel: 'Floragarden di Stinga Baldassarre' },
    { date: '2026-02-26', amt: 2000, hint: 'FLORAPIU', floristLabel: 'Florapiu’ snc di Scanferla Giovanni & C.' },
    { date: '2026-02-27', amt: 377430, hint: 'MARGHERITA', floristLabel: 'Margherita Flower Studio' },
    { date: '2026-03-02', amt: 4500, hint: 'BATTISTELLA', floristLabel: 'Fioreria Battistella s.r.l.' },
    { date: '2026-03-18', amt: 3700, hint: 'MASTRO', floristLabel: 'Mastro Fiori' },
    { date: '2026-03-24', amt: 1800, hint: 'CAPITANO', floristLabel: 'Davide Capitano' },
    { date: '2026-03-26', amt: 2000, hint: 'SHOPPING', floristLabel: 'SHOPPINGARDEN di Anna Bruno' },
];

async function main() {
    const partners = await prisma.partner.findMany({
        where: { deletedAt: null },
        select: { id: true, shopName: true, ownerName: true, vatNumber: true, taxCode: true },
    });

    const lines = await prisma.bankStatementLine.findMany({
        where: {
            amountCents: { lt: 0 },
            OR: [
                { accountingDate: { gte: new Date('2026-01-01'), lte: new Date('2026-03-31') } },
                { valueDate: { gte: new Date('2026-01-01'), lte: new Date('2026-03-31') } },
            ],
        },
        select: {
            id: true,
            amountCents: true,
            accountingDate: true,
            valueDate: true,
            description: true,
            matchType: true,
            matchedOrderId: true,
            matchNotes: true,
            rawJson: true,
        },
        take: 5000,
    });

    const expensesRaw = await prisma.manualFinanceExpense.findMany({
        where: {
            docType: { in: ['FATTURA', 'SCONTRINO', 'RICEVUTA'] },
            expenseDate: { gte: new Date('2025-12-01'), lte: new Date('2026-12-31') },
        },
        select: {
            id: true,
            vendorName: true,
            totalCents: true,
            expenseDate: true,
            description: true,
            metadataJson: true,
            docType: true,
            verificationStatus: true,
            fileName: true,
            notes: true,
        },
        take: 8000,
    });

    const expenses = expensesRaw
        .filter((e) => e.verificationStatus == null || e.verificationStatus === 'CERTIFIED')
        .map((e) => {
            const meta = (e.metadataJson || {}) as Record<string, unknown>;
            const vendorVat =
                (typeof meta.vendorVat === 'string' && meta.vendorVat) ||
                (typeof meta.supplierVat === 'string' && meta.supplierVat) ||
                (typeof meta.cedenteVat === 'string' && meta.cedenteVat) ||
                (typeof meta.piva === 'string' && meta.piva) ||
                null;
            const invoiceNumber =
                (typeof meta.invoiceNumber === 'string' && meta.invoiceNumber) ||
                (typeof meta.documentNumber === 'string' && meta.documentNumber) ||
                (typeof meta.numero === 'string' && meta.numero) ||
                null;
            return {
                id: e.id,
                vendorName: e.vendorName,
                vendorVat,
                invoiceNumber,
                totalCents: Math.abs(e.totalCents),
                expenseDate: e.expenseDate,
                docType: e.docType,
                description: e.description,
            };
        });

    const v1v2 = [];
    for (const row of F3_ROWS) {
        const partner =
            partners.find(
                (p) =>
                    norm(p.shopName).includes(row.hint) ||
                    norm(p.ownerName || '').includes(row.hint) ||
                    namesCompatible(p.shopName, row.floristLabel)
            ) || null;

        const candidates = lines.filter((l) => Math.abs(l.amountCents) === row.amt);
        const byDate = candidates.filter((l) => {
            const d = iso(l.accountingDate) || iso(l.valueDate);
            return d === row.date;
        });
        let hit =
            byDate.find((l) => norm(l.description).includes(row.hint)) ||
            byDate[0] ||
            candidates.find((l) => norm(l.description).includes(row.hint)) ||
            null;

        const meta = hit ? readFloristAlertMeta(hit.rawJson) : {};
        const amountSource =
            typeof meta.overrideAmountCents === 'number' && meta.overrideAmountCents > 0
                ? 'override'
                : hit?.matchedOrderId
                  ? 'compenso_ordine_o_link'
                  : 'bonifico_bancario';

        // Consegne partner: T1 + finestra ±45gg dal bonifico
        const partnerOrders = partner
            ? await prisma.order.findMany({
                  where: {
                      partnerId: partner.id,
                      isTest: false,
                      deletedAt: null,
                      createdAt: { gte: new Date('2025-12-01'), lte: new Date('2026-05-01') },
                  },
                  select: {
                      orderNumber: true,
                      floristCompensationCents: true,
                      deliveryDate: true,
                      createdAt: true,
                      totalPriceCents: true,
                      status: true,
                      deceasedName: true,
                  },
                  take: 100,
              })
            : [];

        const near = partnerOrders.filter((o) => {
            const d = o.deliveryDate || o.createdAt;
            const pay = new Date(`${row.date}T12:00:00Z`);
            const diff = Math.abs(d.getTime() - pay.getTime()) / 86400000;
            return diff <= 45;
        });

        const withComp = near.filter((o) => (o.floristCompensationCents || 0) > 0);
        const sumComp = withComp.reduce((s, o) => s + (o.floristCompensationCents || 0), 0);
        const exactCompMatch = withComp.filter(
            (o) => Math.abs((o.floristCompensationCents || 0) - row.amt) <= 50
        );

        let deliveriesCovered: number;
        let deliveryNote: string;
        if (exactCompMatch.length === 1 && withComp.length <= 2) {
            deliveriesCovered = 1;
            deliveryNote = `compenso ordine ${exactCompMatch[0].orderNumber} ≈ bonifico`;
        } else if (withComp.length >= 2 && Math.abs(sumComp - row.amt) <= 150) {
            deliveriesCovered = withComp.length;
            deliveryNote = `somma ${withComp.length} compensi partner ≈ bonifico (aggregato)`;
        } else if (row.amt >= 50000) {
            deliveriesCovered = Math.max(withComp.length, near.length, 1);
            deliveryNote =
                'importo anomalo (>€500): quasi certamente aggregato / non-fiorista o multi-consegna non ricostruibile da compensi ordine';
        } else if (withComp.length === 0 && near.length === 0) {
            deliveriesCovered = 0;
            deliveryNote =
                'nessun ordine partner nel DB vicino alla data (tipico .eu importato dopo / partner non agganciato)';
        } else if (exactCompMatch.length === 0 && withComp.length > 0) {
            deliveriesCovered = withComp.length;
            deliveryNote = `bonifico non coincide 1:1 con un solo compenso; ${withComp.length} ordini partner con compenso in finestra (da ripartire)`;
        } else {
            deliveriesCovered = Math.max(1, exactCompMatch.length || near.length);
            deliveryNote = 'stima debole';
        }

        // V2: solo match per P.IVA partner (o nome vendor stretto), non amount-only cross-vendor
        const vat = partner?.vatNumber
            ? normalizePassiveSupplierVat(partner.vatNumber)
            : partner?.taxCode
              ? normalizePassiveSupplierVat(partner.taxCode)
              : null;
        const byVat = vat
            ? expenses.filter((e) => normalizePassiveSupplierVat(e.vendorVat) === vat)
            : [];
        const byNameStrict = expenses.filter((e) => namesCompatible(e.vendorName, row.floristLabel));
        const pool = [...new Map([...byVat, ...byNameStrict].map((e) => [e.id, e])).values()];

        const amountHits = pool.filter((e) => Math.abs(e.totalCents - row.amt) <= 100);
        const covers = pool.filter((e) => e.totalCents >= row.amt - 100);
        // same-month / ±60d
        const nearDate = pool.filter((e) => {
            const d = e.expenseDate;
            const pay = new Date(`${row.date}T12:00:00Z`);
            return Math.abs(d.getTime() - pay.getTime()) / 86400000 <= 60;
        });

        let coverage:
            | 'none'
            | 'same_vat_amount'
            | 'same_vat_covers'
            | 'same_vat_other_amounts'
            | 'name_only_amount' = 'none';
        if (byVat.length && amountHits.some((e) => byVat.some((v) => v.id === e.id))) {
            coverage = 'same_vat_amount';
        } else if (byVat.length && covers.some((e) => byVat.some((v) => v.id === e.id))) {
            coverage = 'same_vat_covers';
        } else if (byVat.length) {
            coverage = 'same_vat_other_amounts';
        } else if (amountHits.length && byNameStrict.length) {
            coverage = 'name_only_amount';
        }

        v1v2.push({
            fiorista: row.floristLabel,
            data: row.date,
            importoEuro: (row.amt / 100).toFixed(2),
            fonteImporto: amountSource,
            bankLineId: hit?.id || null,
            causale: hit?.description?.slice(0, 200) || null,
            matchType: hit?.matchType || null,
            matchedOrderId: hit?.matchedOrderId || null,
            overrideAmount: meta.overrideAmountCents || null,
            linkedExpenseId: meta.linkedExpenseId || null,
            partnerVat: partner?.vatNumber || null,
            partnerOrdersNear: near.map((o) => ({
                orderNumber: o.orderNumber,
                compEuro: ((o.floristCompensationCents || 0) / 100).toFixed(2),
                delivery: iso(o.deliveryDate),
                created: iso(o.createdAt),
            })),
            consegneStimate: deliveriesCovered,
            consegneNote: deliveryNote,
            sommaCompensiNearEuro: (sumComp / 100).toFixed(2),
            V2: {
                coverage,
                fatturePartnerArchivio: pool.length,
                matchImporto: amountHits.slice(0, 4).map((e) => ({
                    id: e.id,
                    vendor: e.vendorName,
                    vat: e.vendorVat,
                    number: e.invoiceNumber,
                    date: iso(e.expenseDate),
                    totalEuro: (e.totalCents / 100).toFixed(2),
                    docType: e.docType,
                })),
                altreFattureNearDate: nearDate.slice(0, 4).map((e) => ({
                    vendor: e.vendorName,
                    vat: e.vendorVat,
                    number: e.invoiceNumber,
                    date: iso(e.expenseDate),
                    totalEuro: (e.totalCents / 100).toFixed(2),
                })),
            },
        });
    }

    // V3
    const csv = fs.readFileSync('docs/verbali/FloreMoria_Ordini_Operativi.csv', 'utf8');
    const lista: Array<{ orderNumber: string; date: string; priceCents: number }> = [];
    for (const line of csv.split(/\r?\n/).slice(1)) {
        if (!line.trim() || /^;/.test(line)) continue;
        const parts = line.split(';');
        if (parts.length < 7) continue;
        const orderNumber = (parts[2] || '').trim();
        if (!/^F[FT]-/i.test(orderNumber)) continue;
        const priceCents = parseEuroIt(parts[6] || '0');
        if (priceCents <= 0) continue;
        lista.push({ orderNumber, date: (parts[0] || '').trim(), priceCents });
    }

    const gatewayAll: Array<{
        q: number;
        orderNumber: string;
        date: string;
        grossCents: number;
        transactionId: string;
        gateway: string;
    }> = [];
    for (const q of [1, 2, 3] as const) {
        const b = resolveQuarterBounds(2026, q);
        const built = await buildGatewayCorrispettivi({ start: b.start, end: b.end });
        for (const r of built.rows) {
            gatewayAll.push({
                q,
                orderNumber: (r.orderNumber || '').trim() || 'DA_COLLEGARE',
                date: r.date,
                grossCents: r.grossCents,
                transactionId: r.transactionId,
                gateway: r.canaleIncasso,
            });
        }
    }

    const listaByNum = new Map(lista.map((l) => [l.orderNumber.toUpperCase(), l]));
    // Consume lista rows by amount+date soft match for DA_COLLEGARE
    const listaPool = lista.map((l) => ({ ...l, used: false }));

    function listaDateToIso(dmy: string): string | null {
        const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dmy.trim());
        if (!m) return null;
        return `${m[3]}-${m[2]}-${m[1]}`;
    }

    const classified = gatewayAll.map((g) => {
        const key = g.orderNumber.toUpperCase();
        if (key !== 'DA_COLLEGARE' && listaByNum.has(key)) {
            return {
                ...g,
                class: 'in_lista_by_order' as const,
                listaOrder: key,
            };
        }
        // soft match amount + date (±1 day)
        const soft = listaPool.find((l) => {
            if (l.used) return false;
            if (l.priceCents !== Math.abs(g.grossCents)) return false;
            const isoL = listaDateToIso(l.date);
            if (!isoL) return false;
            const diff =
                Math.abs(new Date(isoL).getTime() - new Date(g.date).getTime()) / 86400000;
            return diff <= 1;
        });
        if (soft) {
            soft.used = true;
            return {
                ...g,
                class: 'in_lista_soft_amount_date' as const,
                listaOrder: soft.orderNumber,
            };
        }
        return { ...g, class: 'extra_vs_lista' as const, listaOrder: null };
    });

    const extras = classified.filter((c) => c.class === 'extra_vs_lista');
    const listaUnused = listaPool.filter((l) => !l.used && !gatewayAll.some((g) => g.orderNumber.toUpperCase() === l.orderNumber.toUpperCase()));

    // Check which extras are py_ recurring / post-closure
    const closureDate = '2026-09-10';
    const extrasEnriched = [];
    for (const e of extras) {
        const move = await prisma.stripeFinanceMovement.findFirst({
            where: {
                OR: [{ sourceId: e.transactionId }, { stripeId: { contains: e.transactionId } }],
            },
            select: { sourceId: true, type: true, createdAtStripe: true, description: true },
        });
        // order created after closure with same amount?
        const laterOrders = await prisma.order.findMany({
            where: {
                isTest: false,
                deletedAt: null,
                totalPriceCents: Math.abs(e.grossCents),
                createdAt: { gt: new Date(`${closureDate}T00:00:00Z`) },
            },
            select: { orderNumber: true, createdAt: true, buyerEmail: true },
            take: 5,
        });
        extrasEnriched.push({
            trimestre: `T${e.q}`,
            ordine: e.orderNumber,
            data: e.date,
            importoEuro: (e.grossCents / 100).toFixed(2),
            gateway: e.gateway,
            transactionId: e.transactionId,
            stripeType: move?.type || null,
            likelyRecurringPy: /^py_/.test(e.transactionId),
            ordersCreatedAfterListaClosure: laterOrders.map((o) => ({
                orderNumber: o.orderNumber,
                created: iso(o.createdAt),
            })),
            hypothesis:
                e.orderNumber === 'DA_COLLEGARE'
                    ? 'incasso gateway senza ordine univoco — tipicamente .eu o ricorrente non in lista per orderNumber'
                    : 'ordine presente in gateway ma assente/diverso in lista operativa',
        });
    }

    const listaGross = lista.reduce((s, l) => s + l.priceCents, 0);
    const gwGross = gatewayAll.reduce((s, g) => s + g.grossCents, 0);

    const out = {
        V1_V2: v1v2,
        V1_summary: {
            n: v1v2.length,
            totalEuro: (v1v2.reduce((s, r) => s + Number(r.importoEuro) * 100, 0) / 100).toFixed(2),
            allBonificoBancario: v1v2.every((r) => r.fonteImporto === 'bonifico_bancario'),
            noneHaveOrderLink: v1v2.every((r) => !r.matchedOrderId),
            aggregatedSuspect: v1v2.filter(
                (r) =>
                    Number(r.importoEuro) >= 500 ||
                    r.consegneStimate > 1 ||
                    r.consegneNote.includes('aggregato') ||
                    r.consegneNote.includes('da ripartire') ||
                    r.consegneNote.includes('anomalo')
            ),
            plainBankNoOrderEuro: (
                v1v2
                    .filter((r) => r.fonteImporto === 'bonifico_bancario' && !r.matchedOrderId)
                    .reduce((s, r) => s + Number(r.importoEuro) * 100, 0) / 100
            ).toFixed(2),
        },
        V2_summary: {
            same_vat_amount: v1v2.filter((r) => r.V2.coverage === 'same_vat_amount').length,
            same_vat_covers: v1v2.filter((r) => r.V2.coverage === 'same_vat_covers').length,
            same_vat_other_amounts: v1v2.filter((r) => r.V2.coverage === 'same_vat_other_amounts')
                .length,
            name_only_amount: v1v2.filter((r) => r.V2.coverage === 'name_only_amount').length,
            none: v1v2.filter((r) => r.V2.coverage === 'none').length,
        },
        V3: {
            listaN: lista.length,
            listaEuro: (listaGross / 100).toFixed(2),
            gatewayN: gatewayAll.length,
            gatewayEuro: (gwGross / 100).toFixed(2),
            deltaEuro: ((gwGross - listaGross) / 100).toFixed(2),
            deltaOfficialEuro: ((gwGross - 409868) / 100).toFixed(2),
            byClass: {
                in_lista_by_order: classified.filter((c) => c.class === 'in_lista_by_order').length,
                in_lista_soft_amount_date: classified.filter(
                    (c) => c.class === 'in_lista_soft_amount_date'
                ).length,
                extra_vs_lista: extras.length,
            },
            extras: extrasEnriched,
            listaUnusedSample: listaUnused.slice(0, 15).map((l) => ({
                orderNumber: l.orderNumber,
                date: l.date,
                euro: (l.priceCents / 100).toFixed(2),
            })),
            byQuarter: {
                T1: {
                    lista: { n: 21, euro: 1038.23 },
                    gateway: {
                        n: gatewayAll.filter((g) => g.q === 1).length,
                        euro: (
                            gatewayAll.filter((g) => g.q === 1).reduce((s, g) => s + g.grossCents, 0) /
                            100
                        ).toFixed(2),
                    },
                    deltaEuro: (
                        (gatewayAll.filter((g) => g.q === 1).reduce((s, g) => s + g.grossCents, 0) -
                            103823) /
                        100
                    ).toFixed(2),
                },
                T2: {
                    lista: { n: 21, euro: 1211.03 },
                    gateway: {
                        n: gatewayAll.filter((g) => g.q === 2).length,
                        euro: (
                            gatewayAll.filter((g) => g.q === 2).reduce((s, g) => s + g.grossCents, 0) /
                            100
                        ).toFixed(2),
                    },
                    deltaEuro: (
                        (gatewayAll.filter((g) => g.q === 2).reduce((s, g) => s + g.grossCents, 0) -
                            121103) /
                        100
                    ).toFixed(2),
                },
                T3: {
                    lista: { n: 33, euro: 1849.42 },
                    gateway: {
                        n: gatewayAll.filter((g) => g.q === 3).length,
                        euro: (
                            gatewayAll.filter((g) => g.q === 3).reduce((s, g) => s + g.grossCents, 0) /
                            100
                        ).toFixed(2),
                    },
                    deltaEuro: (
                        (gatewayAll.filter((g) => g.q === 3).reduce((s, g) => s + g.grossCents, 0) -
                            184942) /
                        100
                    ).toFixed(2),
                },
            },
        },
    };

    fs.writeFileSync('/tmp/diag-f3-v1v2v3-deep.json', JSON.stringify(out, null, 2));
    console.log(
        JSON.stringify(
            {
                wrote: '/tmp/diag-f3-v1v2v3-deep.json',
                V1_summary: out.V1_summary,
                V2_summary: out.V2_summary,
                V3_delta: out.V3.deltaOfficialEuro,
                V3_extras_n: out.V3.extras.length,
                V3_byQ: out.V3.byQuarter,
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
