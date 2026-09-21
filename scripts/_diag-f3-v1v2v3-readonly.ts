/**
 * V1/V2/V3 — sola lettura F3 T1 + delta fatturato 2026.
 * NON chiama listFloristMissingInvoices (ha side-effect di scrittura su bank links).
 */
import fs from 'node:fs';
import path from 'node:path';
import prisma from '@/lib/prisma';
import { resolveQuarterBounds } from '@/lib/financial/taxQuarterly';
import { buildGatewayCorrispettivi } from '@/lib/financial/dossierCorrispettiviBuild';
import { readFloristAlertMeta } from '@/lib/financial/floristMissingInvoices';
import { orderReferenceDate } from '@/lib/financial/floristDocStatus';
import { OFFICIAL_REVENUE_2026 } from '@/lib/financial/officialRevenue2026';
import { normalizePassiveSupplierVat } from '@/lib/financial/passiveInvoiceIdentity';

const T1 = resolveQuarterBounds(2026, 1);

function toIso(d: Date | null | undefined): string | null {
    if (!d) return null;
    return d.toISOString().slice(0, 10);
}

function inT1(iso: string | null): boolean {
    if (!iso) return false;
    const d = new Date(`${iso}T12:00:00.000Z`);
    return d >= T1.start && d <= T1.end;
}

function normalizeName(s: string): string {
    return s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim();
}

function namesCompatible(a: string, b: string): boolean {
    const na = normalizeName(a);
    const nb = normalizeName(b);
    if (!na || !nb) return false;
    if (na.includes(nb) || nb.includes(na)) return true;
    const tokens = na.split(' ').filter((t) => t.length > 3);
    return tokens.some((t) => nb.includes(t));
}

function isLikelyNonFloristBankDescription(description: string): boolean {
    const d = description.toUpperCase();
    return (
        /\bSDD\b/.test(d) ||
        /PAYPAL EUROPE/.test(d) ||
        /ADDEBITO SDD/.test(d) ||
        /STRIPE/.test(d) ||
        /COMMISSIONI/.test(d)
    );
}

function parseEuro(s: string): number {
    const t = s.replace(/[€\s]/g, '').replace(/\./g, '').replace(',', '.');
    const n = Number(t);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

async function main() {
    const partners = await prisma.partner.findMany({
        where: { deletedAt: null },
        select: {
            id: true,
            shopName: true,
            ownerName: true,
            vatNumber: true,
            taxCode: true,
        },
        take: 500,
    });

    const lookback = new Date(Date.UTC(2026, 0, 1));
    const bankLines = await prisma.bankStatementLine.findMany({
        where: {
            amountCents: { lt: 0 },
            OR: [
                { matchType: { in: ['FLORIST_TRANSFER', 'FLORIST_INVOICE', 'FLORIST_ADVANCE'] } },
                { accountingDate: { gte: lookback } },
                { valueDate: { gte: lookback } },
            ],
        },
        select: {
            id: true,
            amountCents: true,
            accountingDate: true,
            valueDate: true,
            description: true,
            matchType: true,
            matchNotes: true,
            matchedOrderId: true,
            documentId: true,
            rawJson: true,
        },
        take: 3000,
    });

    const orderIds = [
        ...new Set(bankLines.map((l) => l.matchedOrderId).filter(Boolean) as string[]),
    ];
    const linkedOrders =
        orderIds.length > 0
            ? await prisma.order.findMany({
                  where: { id: { in: orderIds } },
                  select: {
                      id: true,
                      orderNumber: true,
                      partnerId: true,
                      floristCompensationCents: true,
                      createdAt: true,
                      deliveryDate: true,
                      deceasedName: true,
                      cemeteryCity: true,
                      partner: { select: { shopName: true, ownerName: true, vatNumber: true } },
                  },
              })
            : [];
    const orderById = new Map(linkedOrders.map((o) => [o.id, o]));

    // Ordini partner con delivery/created in T1 (per stima consegne coperte da bonifico aggregato)
    const t1Orders = await prisma.order.findMany({
        where: {
            isTest: false,
            deletedAt: null,
            OR: [
                { deliveryDate: { gte: T1.start, lte: T1.end } },
                {
                    AND: [
                        { deliveryDate: null },
                        { createdAt: { gte: T1.start, lte: T1.end } },
                    ],
                },
            ],
        },
        select: {
            id: true,
            orderNumber: true,
            partnerId: true,
            floristCompensationCents: true,
            deliveryDate: true,
            createdAt: true,
            status: true,
            partner: { select: { shopName: true, vatNumber: true } },
        },
        take: 2000,
    });

    type F3Probe = {
        bankLineId: string;
        florist: string;
        partnerId: string | null;
        partnerVat: string | null;
        dateIso: string;
        bankDateIso: string;
        amountCents: number;
        bankAmountCents: number;
        amountSource: 'override' | 'compenso_ordine' | 'bonifico_bancario';
        orderId: string | null;
        orderNumber: string | null;
        description: string;
        matchType: string | null;
        linkedExpenseId: string | null;
        receiptUrl: string | null;
        receiptPath: string | null;
        deliveriesCoveredEstimate: number;
        deliveryOrders: Array<{ orderNumber: string | null; compCents: number; date: string }>;
        bankVsCompDeltaCents: number | null;
    };

    const f3: F3Probe[] = [];

    for (const line of bankLines) {
        const alertMeta = readFloristAlertMeta(line.rawJson);
        if (alertMeta.dismissedAt) continue;
        if (alertMeta.receiptUrl || alertMeta.receiptPath || alertMeta.linkedExpenseId) continue;

        const bankPayDate = line.accountingDate || line.valueDate;
        if (!bankPayDate || bankPayDate < lookback) continue;

        const floristType =
            line.matchType === 'FLORIST_TRANSFER' ||
            line.matchType === 'FLORIST_INVOICE' ||
            line.matchType === 'FLORIST_ADVANCE';

        if (isLikelyNonFloristBankDescription(line.description) && !line.matchedOrderId) {
            continue;
        }

        let partner =
            partners.find(
                (p) =>
                    namesCompatible(p.shopName, line.description) ||
                    namesCompatible(p.ownerName || '', line.description)
            ) || null;

        if (!partner && !floristType && !line.matchedOrderId) continue;

        const bankAmountCents = Math.abs(line.amountCents);
        let amountCents =
            typeof alertMeta.overrideAmountCents === 'number' && alertMeta.overrideAmountCents > 0
                ? alertMeta.overrideAmountCents
                : bankAmountCents;
        let amountSource: F3Probe['amountSource'] =
            typeof alertMeta.overrideAmountCents === 'number' && alertMeta.overrideAmountCents > 0
                ? 'override'
                : 'bonifico_bancario';

        const linked = line.matchedOrderId ? orderById.get(line.matchedOrderId) || null : null;
        let orderId = linked?.id || null;
        let orderNumber = linked?.orderNumber || null;

        if (linked) {
            if (linked.floristCompensationCents && linked.floristCompensationCents > 0) {
                // Solo se la logica F3 attuale sostituisce: sì, fa override con compenso
                amountCents = linked.floristCompensationCents;
                amountSource = 'compenso_ordine';
            }
            if (linked.partnerId) {
                const op = partners.find((p) => p.id === linked.partnerId);
                if (op) partner = op;
            }
        }

        let refDate = bankPayDate;
        if (alertMeta.overridePaymentDate) {
            const ov = new Date(`${alertMeta.overridePaymentDate}T12:00:00.000Z`);
            if (!Number.isNaN(ov.getTime())) refDate = ov;
        } else if (linked) {
            refDate = orderReferenceDate(linked);
        }

        const dateIso = toIso(refDate)!;
        const filterIso = linked?.deliveryDate ? toIso(linked.deliveryDate)! : dateIso;
        if (!inT1(filterIso)) continue;

        // Stima consegne coperte
        let deliveryOrders: F3Probe['deliveryOrders'] = [];
        if (linked) {
            deliveryOrders = [
                {
                    orderNumber: linked.orderNumber,
                    compCents: linked.floristCompensationCents || 0,
                    date: toIso(linked.deliveryDate) || toIso(linked.createdAt) || dateIso,
                },
            ];
        } else if (partner) {
            // Bonifico senza ordine: ordini dello stesso partner in T1 con compenso
            const candidates = t1Orders.filter((o) => o.partnerId === partner!.id);
            // Prova a trovare sottoinsieme la cui somma ≈ bankAmount
            const withComp = candidates
                .filter((o) => (o.floristCompensationCents || 0) > 0)
                .map((o) => ({
                    orderNumber: o.orderNumber,
                    compCents: o.floristCompensationCents || 0,
                    date: toIso(o.deliveryDate) || toIso(o.createdAt) || '',
                }));
            const sum = withComp.reduce((s, x) => s + x.compCents, 0);
            if (withComp.length && Math.abs(sum - bankAmountCents) <= 100) {
                deliveryOrders = withComp;
            } else if (withComp.length && bankAmountCents > 0) {
                // greedy: accumula finché non supera di molto
                const sorted = [...withComp].sort((a, b) => a.date.localeCompare(b.date));
                let acc = 0;
                const picked: typeof withComp = [];
                for (const c of sorted) {
                    if (acc + c.compCents <= bankAmountCents + 100) {
                        picked.push(c);
                        acc += c.compCents;
                    }
                }
                deliveryOrders = picked.length ? picked : withComp;
            } else {
                deliveryOrders = candidates.map((o) => ({
                    orderNumber: o.orderNumber,
                    compCents: o.floristCompensationCents || 0,
                    date: toIso(o.deliveryDate) || toIso(o.createdAt) || '',
                }));
            }
        }

        f3.push({
            bankLineId: line.id,
            florist: partner?.shopName || partner?.ownerName || 'Fiorista (da causale)',
            partnerId: partner?.id || null,
            partnerVat: partner?.vatNumber || partner?.taxCode || null,
            dateIso: filterIso,
            bankDateIso: toIso(bankPayDate)!,
            amountCents,
            bankAmountCents,
            amountSource,
            orderId,
            orderNumber,
            description: line.description.slice(0, 160),
            matchType: line.matchType,
            linkedExpenseId: alertMeta.linkedExpenseId || null,
            receiptUrl: alertMeta.receiptUrl || null,
            receiptPath: alertMeta.receiptPath || null,
            deliveriesCoveredEstimate: Math.max(1, deliveryOrders.length || 1),
            deliveryOrders,
            bankVsCompDeltaCents:
                amountSource === 'compenso_ordine'
                    ? bankAmountCents - amountCents
                    : bankAmountCents !== amountCents
                      ? bankAmountCents - amountCents
                      : null,
        });
    }

    // Anche rami "order-only" (PAID senza bank) — stesso filtro T1 di F3
    const paidOrders = await prisma.order.findMany({
        where: {
            isTest: false,
            deletedAt: null,
            partnerId: { not: null },
            OR: [
                { partnerPaymentStatus: 'PAID' },
                { floristSettlementStatus: { in: ['BONIFICATO', 'RICEVUTA'] } },
            ],
            createdAt: { gte: lookback },
            floristCompensationCents: { not: null },
        },
        select: {
            id: true,
            orderNumber: true,
            floristCompensationCents: true,
            floristSettlementStatus: true,
            createdAt: true,
            deliveryDate: true,
            veraWorkflowFlags: true,
            partner: {
                select: { id: true, shopName: true, ownerName: true, vatNumber: true, taxCode: true },
            },
        },
        take: 250,
    });

    for (const order of paidOrders) {
        if (order.floristSettlementStatus === 'RICEVUTA') continue;
        const flags = (order.veraWorkflowFlags || {}) as Record<string, unknown>;
        if (flags.floristMissingDismissedAt) continue;
        if (!order.partner) continue;
        const amountCents = order.floristCompensationCents || 0;
        if (amountCents <= 0) continue;
        if (f3.some((r) => r.orderId === order.id)) continue;

        const ref = orderReferenceDate(order);
        const filterIso = order.deliveryDate ? toIso(order.deliveryDate)! : toIso(ref)!;
        if (!inT1(filterIso)) continue;

        f3.push({
            bankLineId: `order-${order.id}`,
            florist: order.partner.shopName || order.partner.ownerName || 'Fiorista',
            partnerId: order.partner.id,
            partnerVat: order.partner.vatNumber || order.partner.taxCode || null,
            dateIso: filterIso,
            bankDateIso: toIso(ref)!,
            amountCents,
            bankAmountCents: amountCents,
            amountSource: 'compenso_ordine',
            orderId: order.id,
            orderNumber: order.orderNumber,
            description: 'order-only (PAID/BONIFICATO senza bank line in F3)',
            matchType: null,
            linkedExpenseId: null,
            receiptUrl: null,
            receiptPath: null,
            deliveriesCoveredEstimate: 1,
            deliveryOrders: [
                {
                    orderNumber: order.orderNumber,
                    compCents: amountCents,
                    date: filterIso,
                },
            ],
            bankVsCompDeltaCents: null,
        });
    }

    f3.sort((a, b) => a.dateIso.localeCompare(b.dateIso));

    // V2 — fatture passive in archivio (manualFinanceExpense: VAT/numero in metadataJson)
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
            notes: true,
            metadataJson: true,
            fileName: true,
            docType: true,
            verificationStatus: true,
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

    // Solo ManualFinanceExpense (archivio fatture passive / YouDox / report / manuale)

    function vatNorm(v: string | null | undefined): string | null {
        try {
            return normalizePassiveSupplierVat(v);
        } catch {
            return null;
        }
    }

    const v2 = f3.map((row) => {
        const vat = vatNorm(row.partnerVat);
        const byVat = vat
            ? expenses.filter((e) => vatNorm(e.vendorVat) === vat)
            : [];
        const byName = expenses.filter((e) => namesCompatible(e.vendorName || '', row.florist));
        const pool = [...new Map([...byVat, ...byName].map((e) => [e.id, e])).values()];

        const exactAmount = pool.filter(
            (e) => Math.abs(Math.abs(e.totalCents) - row.amountCents) <= 50
        );
        const exactBank = pool.filter(
            (e) => Math.abs(Math.abs(e.totalCents) - row.bankAmountCents) <= 50
        );
        const covering = pool.filter((e) => Math.abs(e.totalCents) >= row.amountCents - 50);
        const partial = pool.filter(
            (e) =>
                Math.abs(e.totalCents) > 0 &&
                Math.abs(e.totalCents) < row.bankAmountCents - 50 &&
                Math.abs(e.totalCents) >= Math.min(...row.deliveryOrders.map((d) => d.compCents).filter((c) => c > 0), row.amountCents) - 50
        );

        let coverage: 'none' | 'full_amount_match' | 'bank_amount_match' | 'invoice_covers_or_exceeds' | 'partial_possible' =
            'none';
        if (exactAmount.length) coverage = 'full_amount_match';
        else if (exactBank.length) coverage = 'bank_amount_match';
        else if (covering.length) coverage = 'invoice_covers_or_exceeds';
        else if (partial.length || pool.length) coverage = pool.length ? 'partial_possible' : 'none';

        return {
            florist: row.florist,
            date: row.dateIso,
            amountCents: row.amountCents,
            bankAmountCents: row.bankAmountCents,
            amountSource: row.amountSource,
            coverage,
            matchingInvoices: [...exactAmount, ...exactBank, ...covering, ...partial]
                .slice(0, 5)
                .map((e) => ({
                    id: e.id,
                    vendor: e.vendorName,
                    vat: e.vendorVat,
                    number: e.invoiceNumber,
                    date: toIso(e.expenseDate),
                    totalCents: e.totalCents,
                })),
            partnerInvoicesInArchive: pool.length,
        };
    });

    // V3 — delta vendite vs lista operativa
    const csvPath = path.join(process.cwd(), 'docs/verbali/FloreMoria_Ordini_Operativi.csv');
    const csv = fs.readFileSync(csvPath, 'utf8');
    const listaRows: Array<{ orderNumber: string; date: string; priceCents: number; status: string }> =
        [];
    for (const line of csv.split(/\r?\n/).slice(1)) {
        if (!line.trim() || line.startsWith(';')) continue;
        const parts = line.split(';');
        if (parts.length < 7) continue;
        const orderNumber = (parts[2] || '').trim();
        if (!/^F[FT]-/i.test(orderNumber)) continue;
        const priceCents = parseEuro(parts[6] || '0');
        if (priceCents <= 0) continue; // esclude pose €0
        listaRows.push({
            orderNumber,
            date: (parts[0] || '').trim(),
            priceCents,
            status: (parts[11] || '').trim(),
        });
    }

    const quarters: Array<1 | 2 | 3> = [1, 2, 3];
    const gatewayAll: Array<{
        q: number;
        orderNumber: string;
        date: string;
        grossCents: number;
        transactionId: string;
        gateway: string;
    }> = [];

    for (const q of quarters) {
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

    const listaSet = new Map(listaRows.map((r) => [r.orderNumber.toUpperCase(), r]));
    const listaGross = listaRows.reduce((s, r) => s + r.priceCents, 0);
    const gwGross = gatewayAll.reduce((s, r) => s + r.grossCents, 0);

    // Match by order number
    const extraVsLista: typeof gatewayAll = [];
    const matchedGw = new Set<string>();
    for (const g of gatewayAll) {
        const key = g.orderNumber.toUpperCase();
        if (key !== 'DA_COLLEGARE' && listaSet.has(key)) {
            matchedGw.add(`${g.q}|${g.transactionId}`);
            continue;
        }
        // soft: same amount+date in lista?
        const dmy = g.date; // yyyy-mm-dd
        const [yy, mm, dd] = dmy.split('-');
        const listaDate = `${dd}/${mm}/${yy}`;
        const soft = listaRows.find(
            (l) => l.priceCents === Math.abs(g.grossCents) && l.date === listaDate
        );
        if (soft) {
            matchedGw.add(`${g.q}|${g.transactionId}`);
            continue;
        }
        extraVsLista.push(g);
    }

    const listaOnly = listaRows.filter((l) => {
        const hit = gatewayAll.some((g) => g.orderNumber.toUpperCase() === l.orderNumber.toUpperCase());
        return !hit;
    });

    // Amount-level: find which extras explain +278.48
    const deltaCents = gwGross - listaGross;

    const bankAggregated = f3.filter(
        (r) =>
            r.amountSource === 'bonifico_bancario' &&
            (!r.orderId || r.deliveriesCoveredEstimate > 1 || r.bankAmountCents !== r.amountCents)
    );
    const bankNoOrder = f3.filter((r) => r.amountSource === 'bonifico_bancario' && !r.orderId);
    const bankWithMultiDelivery = f3.filter(
        (r) => r.amountSource === 'bonifico_bancario' && r.deliveriesCoveredEstimate > 1
    );

    const out = {
        generatedAt: new Date().toISOString(),
        note: 'Sola lettura — non chiama listFloristMissingInvoices (evita repair writes)',
        V1: {
            t1Bounds: { start: toIso(T1.start), end: toIso(T1.end) },
            rowCount: f3.length,
            totalCents: f3.reduce((s, r) => s + r.amountCents, 0),
            rows: f3.map((r, i) => ({
                n: i + 1,
                fiorista: r.florist,
                data: r.dateIso,
                dataBonifico: r.bankDateIso,
                importoEuro: (r.amountCents / 100).toFixed(2),
                importoBonificoEuro: (r.bankAmountCents / 100).toFixed(2),
                fonteImporto: r.amountSource,
                ordineCollegato: r.orderNumber || null,
                consegneStimate: r.deliveriesCoveredEstimate,
                consegneDettaglio: r.deliveryOrders,
                bankVsCompensoDeltaEuro:
                    r.bankVsCompDeltaCents == null
                        ? null
                        : (r.bankVsCompDeltaCents / 100).toFixed(2),
                causale: r.description,
                matchType: r.matchType,
                bankLineId: r.bankLineId,
            })),
            aggregatedBankHypothesis: {
                righeSoloBonificoSenzaOrdine: bankNoOrder.length,
                importoSoloBonificoSenzaOrdineEuro: (
                    bankNoOrder.reduce((s, r) => s + r.amountCents, 0) / 100
                ).toFixed(2),
                righeBonificoConPiuConsegneStimate: bankWithMultiDelivery.length,
                importoMultiConsegnaEuro: (
                    bankWithMultiDelivery.reduce((s, r) => s + r.amountCents, 0) / 100
                ).toFixed(2),
                righeFonteBonificoBancario: f3.filter((r) => r.amountSource === 'bonifico_bancario')
                    .length,
                importoFonteBonificoEuro: (
                    f3
                        .filter((r) => r.amountSource === 'bonifico_bancario')
                        .reduce((s, r) => s + r.amountCents, 0) / 100
                ).toFixed(2),
            },
        },
        V2: {
            rows: v2,
            summary: {
                none: v2.filter((r) => r.coverage === 'none').length,
                full_amount_match: v2.filter((r) => r.coverage === 'full_amount_match').length,
                bank_amount_match: v2.filter((r) => r.coverage === 'bank_amount_match').length,
                invoice_covers_or_exceeds: v2.filter((r) => r.coverage === 'invoice_covers_or_exceeds')
                    .length,
                partial_possible: v2.filter((r) => r.coverage === 'partial_possible').length,
            },
        },
        V3: {
            listaOperativa: {
                n: listaRows.length,
                grossEuro: (listaGross / 100).toFixed(2),
                officialConst: OFFICIAL_REVENUE_2026,
            },
            gatewayCorrispettivi: {
                n: gatewayAll.length,
                grossEuro: (gwGross / 100).toFixed(2),
                byQ: [1, 2, 3].map((q) => {
                    const rows = gatewayAll.filter((g) => g.q === q);
                    return {
                        q,
                        n: rows.length,
                        grossEuro: (rows.reduce((s, r) => s + r.grossCents, 0) / 100).toFixed(2),
                    };
                }),
            },
            deltaEuro: (deltaCents / 100).toFixed(2),
            extraVsLista: extraVsLista.map((g) => ({
                trimestre: `T${g.q}`,
                ordine: g.orderNumber,
                data: g.date,
                importoEuro: (g.grossCents / 100).toFixed(2),
                gateway: g.gateway,
                transactionId: g.transactionId,
            })),
            listaOnlyNotInGateway: listaOnly.map((l) => ({
                ordine: l.orderNumber,
                data: l.date,
                importoEuro: (l.priceCents / 100).toFixed(2),
            })),
            officialByQvsGateway: {
                T1: {
                    lista: OFFICIAL_REVENUE_2026.byQuarter.T1,
                    gateway: {
                        n: gatewayAll.filter((g) => g.q === 1).length,
                        euro: (
                            gatewayAll.filter((g) => g.q === 1).reduce((s, r) => s + r.grossCents, 0) /
                            100
                        ).toFixed(2),
                    },
                },
                T2: {
                    lista: OFFICIAL_REVENUE_2026.byQuarter.T2,
                    gateway: {
                        n: gatewayAll.filter((g) => g.q === 2).length,
                        euro: (
                            gatewayAll.filter((g) => g.q === 2).reduce((s, r) => s + r.grossCents, 0) /
                            100
                        ).toFixed(2),
                    },
                },
                T3: {
                    lista: OFFICIAL_REVENUE_2026.byQuarter.T3,
                    gateway: {
                        n: gatewayAll.filter((g) => g.q === 3).length,
                        euro: (
                            gatewayAll.filter((g) => g.q === 3).reduce((s, r) => s + r.grossCents, 0) /
                            100
                        ).toFixed(2),
                    },
                },
            },
        },
    };

    const outPath = '/tmp/diag-f3-v1v2v3.json';
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
    console.log(JSON.stringify({ wrote: outPath, V1_n: f3.length, V1_total: out.V1.totalCents, V3_delta: out.V3.deltaEuro, V3_extra_n: extraVsLista.length }, null, 2));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
