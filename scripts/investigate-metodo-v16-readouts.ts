/**
 * Indagine sola lettura — METODO v1.6 punti 1–4.
 * Uso: npx tsx scripts/investigate-metodo-v16-readouts.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();
if (process.env.DATABASE_URL_UNPOOLED) {
    process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
}

import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import prisma from '../lib/prisma';
import { loadSoldUnitsByProductId } from '../lib/products/productCatalogMetrics';

function normVendor(s: string): string {
    return String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function normDocNum(s: string): string {
    return String(s || '')
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/^0+/, '');
}

function parseItDate(v: unknown): string | null {
    if (v instanceof Date && !Number.isNaN(v.getTime())) {
        return v.toISOString().slice(0, 10);
    }
    const s = String(v || '').trim();
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) {
        return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return null;
}

function euro(cents: number) {
    return (cents / 100).toLocaleString('it-IT', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
    });
}

type ReportRow = {
    vendor: string;
    piva: string;
    date: string;
    docNum: string;
    imponibileCents: number;
    ivaCents: number;
    totaleCents: number;
    sdiId: string;
    progressivo: string;
};

async function loadReportRows(filePath: string): Promise<ReportRow[]> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const ws = wb.worksheets[0];
    const out: ReportRow[] = [];
    ws.eachRow((row, rn) => {
        if (rn === 1) return;
        const v = [...row.values].slice(1);
        if (!v[5] && !v[4]) return;
        const date = parseItDate(v[1]);
        if (!date || !date.startsWith('2026')) return;
        const imponibile = Math.round(Number(v[8] || 0) * 100);
        const iva = Math.round(Number(v[9] || 0) * 100);
        out.push({
            vendor: String(v[5] || ''),
            piva: String(v[6] || ''),
            date,
            docNum: String(v[4] || ''),
            imponibileCents: imponibile,
            ivaCents: iva,
            totaleCents: imponibile + iva,
            sdiId: String(v[17] || ''),
            progressivo: String(v[16] || ''),
        });
    });
    return out;
}

function reportKey(r: { vendor: string; piva: string; date: string; docNum: string }): string {
    const who = r.piva ? `PIVA:${r.piva.replace(/\s/g, '')}` : `V:${normVendor(r.vendor)}`;
    return `${who}|${r.date}|${normDocNum(r.docNum)}`;
}

async function main() {
    const out: Record<string, unknown> = {
        generatedAt: new Date().toISOString(),
        methodVersion: '1.6',
    };

    // ——— Punto 1: Report vs Youdox (manual expenses) ———
    const reportFiles = [
        '/Users/floremoria/Downloads/Report_Fatture_ricevute_2026.xlsx',
        '/Users/floremoria/Downloads/Report_Fatture_ricevute_2026-T1.xlsx',
        '/Users/floremoria/Downloads/Report_Fatture_ricevute_2026-T2.xlsx',
        '/Users/floremoria/Downloads/Report_Fatture_ricevute_2026-T3.xlsx',
    ].filter((p) => fs.existsSync(p));

    const reportByKey = new Map<string, ReportRow & { files: string[] }>();
    for (const f of reportFiles) {
        const rows = await loadReportRows(f);
        for (const r of rows) {
            const k = reportKey(r);
            const prev = reportByKey.get(k);
            if (!prev) {
                reportByKey.set(k, { ...r, files: [path.basename(f)] });
            } else {
                prev.files.push(path.basename(f));
            }
        }
    }

    const manuals = await prisma.manualFinanceExpense.findMany({
        where: {
            expenseDate: {
                gte: new Date(2026, 0, 1),
                lte: new Date(2026, 11, 31, 23, 59, 59, 999),
            },
        },
        select: {
            id: true,
            expenseDate: true,
            vendorName: true,
            netCents: true,
            vatCents: true,
            totalCents: true,
            metadataJson: true,
            fileName: true,
            canonicalDocKey: true,
            docType: true,
        },
    });

    const sourceCounts: Record<string, number> = {};
    const youdoxLike: Array<{
        id: string;
        vendor: string;
        piva: string;
        date: string;
        docNum: string;
        totaleCents: number;
        source: string;
    }> = [];

    for (const m of manuals) {
        const meta = (m.metadataJson || {}) as Record<string, unknown>;
        const source = String(meta.source || meta.channel || meta.ingestChannel || 'UNKNOWN');
        sourceCounts[source] = (sourceCounts[source] || 0) + 1;
        const blob = JSON.stringify(meta).toLowerCase();
        const isYoudox =
            /youdox|YOUDOX|sdi_xml|SDI_PASSIVA|PASSIVE_SDI/i.test(source) ||
            /youdox/.test(blob) ||
            Boolean(meta.sdiId) ||
            Boolean(meta.IdentifcativoSdI) ||
            Boolean(meta.identificativoSdi) ||
            Boolean(meta.progressivoInvio);

        const docNum =
            (typeof meta.invoiceNumber === 'string' && meta.invoiceNumber) ||
            (typeof meta.documentNumber === 'string' && meta.documentNumber) ||
            (typeof meta.numero === 'string' && meta.numero) ||
            (typeof meta.documento_numero === 'string' && meta.documento_numero) ||
            '';
        const piva =
            (typeof meta.vendorVat === 'string' && meta.vendorVat) ||
            (typeof meta.vatNumber === 'string' && meta.vatNumber) ||
            (typeof meta.piva === 'string' && meta.piva) ||
            '';

        // Consider all Italian FATTURA rows as potential Youdox/SDI ingest for overlap
        // Prefer explicit youdox; else FATTURA with XML-ish filename
        const fileLooksSdi = /\.xml/i.test(m.fileName || '') || /IT[A-Z0-9]+_/i.test(m.fileName || '');
        if (isYoudox || (m.docType === 'FATTURA' && fileLooksSdi) || source.includes('SDI')) {
            youdoxLike.push({
                id: m.id,
                vendor: m.vendorName,
                piva,
                date: m.expenseDate.toISOString().slice(0, 10),
                docNum,
                totaleCents: m.totalCents,
                source,
            });
        }
    }

    const overlaps: Array<Record<string, unknown>> = [];
    let overlapTotale = 0;
    const usedYoudox = new Set<string>();

    for (const [k, rep] of reportByKey) {
        const match = youdoxLike.find((y) => {
            if (usedYoudox.has(y.id)) return false;
            const yk = reportKey(y);
            if (yk === k) return true;
            // Fallback: same date + docNum + vendor fuzzy
            return (
                y.date === rep.date &&
                normDocNum(y.docNum) === normDocNum(rep.docNum) &&
                (normVendor(y.vendor) === normVendor(rep.vendor) ||
                    (y.piva && rep.piva && y.piva.replace(/\s/g, '') === rep.piva.replace(/\s/g, '')))
            );
        });
        if (match) {
            usedYoudox.add(match.id);
            overlaps.push({
                key: k,
                vendor: rep.vendor,
                date: rep.date,
                docNum: rep.docNum,
                reportTotaleCents: rep.totaleCents,
                youdoxTotaleCents: match.totaleCents,
                youdoxSource: match.source,
            });
            overlapTotale += rep.totaleCents;
        }
    }

    out.punto1 = {
        reportFiles,
        reportUnique2026: reportByKey.size,
        manual2026: manuals.length,
        manualSourceCounts: sourceCounts,
        youdoxLikeCount: youdoxLike.length,
        overlapCount: overlaps.length,
        overlapTotaleEuro: overlapTotale / 100,
        overlaps,
        note:
            'Match: stesso fornitore (P.IVA o nome) + data documento + numero progressivo. Youdox = ManualFinanceExpense con indizi SDI/YouDOX.',
    };

    // ——— Punto 2: 9 .eu→.com from 2026-07-02 ———
    const euOnComList = [
        { date: '2026-08-21', name: 'Oreste Poverello', eur: 89.99 },
        { date: '2026-08-17', name: 'Amanda Favot', eur: 109.98 },
        { date: '2026-08-10', name: 'Edy, Lori and Dana Moras', eur: 69.99 },
        { date: '2026-08-06', name: 'Daniela Barilari', eur: 39.99 },
        { date: '2026-08-01', name: 'valentina cecchini', eur: 29.99 },
        { date: '2026-07-16', name: 'Filomena Maiorano', eur: 37.99 },
        { date: '2026-07-09', name: 'Giulio Rosace', eur: 39.99 },
        { date: '2026-07-03', name: 'Confartigianato Pordenone', eur: 69.99 },
        { date: '2026-07-02', name: 'Nicolato Francesco', eur: 104.98 },
    ];

    const fromJuly = await prisma.order.findMany({
        where: {
            deletedAt: null,
            isTest: false,
            createdAt: { gte: new Date(2026, 6, 2) },
            partnerPaymentStatus: 'PAID',
        },
        select: {
            id: true,
            orderNumber: true,
            createdAt: true,
            buyerFullName: true,
            buyerEmail: true,
            totalPriceCents: true,
            grossAmount: true,
            stripeTransactionId: true,
        },
        orderBy: { createdAt: 'asc' },
    });

    function nameMatch(a: string, b: string) {
        const na = normVendor(a);
        const nb = normVendor(b);
        if (!na || !nb) return false;
        return na.includes(nb) || nb.includes(na) || na.split(' ').some((t) => t.length > 3 && nb.includes(t));
    }

    const matched9: Array<Record<string, unknown>> = [];
    const missing9: Array<Record<string, unknown>> = [];
    for (const row of euOnComList) {
        const cents = Math.round(row.eur * 100);
        const dayStart = new Date(row.date + 'T00:00:00.000Z');
        const dayEnd = new Date(row.date + 'T23:59:59.999Z');
        // allow ±1 day
        const winStart = new Date(dayStart.getTime() - 86400000);
        const winEnd = new Date(dayEnd.getTime() + 86400000);
        const cand = fromJuly.filter((o) => {
            const gross =
                o.grossAmount != null ? Math.round(o.grossAmount * 100) : o.totalPriceCents;
            const amountOk = Math.abs(gross - cents) <= 1;
            const dateOk = o.createdAt >= winStart && o.createdAt <= winEnd;
            const nameOk = nameMatch(o.buyerFullName || '', row.name);
            return amountOk && (dateOk || nameOk) && (dateOk || amountOk);
        });
        const best =
            cand.find((o) => nameMatch(o.buyerFullName || '', row.name) && Math.abs((o.grossAmount != null ? Math.round(o.grossAmount * 100) : o.totalPriceCents) - cents) <= 1) ||
            cand[0];
        if (best) {
            matched9.push({
                list: row,
                orderNumber: best.orderNumber,
                orderId: best.id,
                createdAt: best.createdAt.toISOString(),
                buyer: best.buyerFullName,
                stripeTransactionId: best.stripeTransactionId,
            });
        } else {
            missing9.push(row);
        }
    }

    // Gateway txn → multiple orders?
    const stripeMoves = await prisma.stripeFinanceMovement.findMany({
        where: {
            OR: [
                { createdAtStripe: { gte: new Date(2026, 0, 1), lte: new Date(2026, 11, 31, 23, 59, 59, 999) } },
                { createdAt: { gte: new Date(2026, 0, 1), lte: new Date(2026, 11, 31, 23, 59, 59, 999) } },
            ],
        },
        select: { stripeId: true, orderId: true, type: true, amountCents: true },
        take: 20000,
    });
    const byStripeId = new Map<string, Set<string>>();
    for (const m of stripeMoves) {
        if (!m.orderId || !m.stripeId) continue;
        if (!byStripeId.has(m.stripeId)) byStripeId.set(m.stripeId, new Set());
        byStripeId.get(m.stripeId)!.add(m.orderId);
    }
    const multiOrderTx = [...byStripeId.entries()]
        .filter(([, ids]) => ids.size > 1)
        .map(([sid, ids]) => ({ stripeId: sid, orderIds: [...ids] }));

    // Also Order.stripeTransactionId duplicates
    const ordersWithTx = await prisma.order.findMany({
        where: {
            deletedAt: null,
            isTest: false,
            stripeTransactionId: { not: null },
        },
        select: { id: true, orderNumber: true, stripeTransactionId: true },
    });
    const byTx = new Map<string, string[]>();
    for (const o of ordersWithTx) {
        const t = o.stripeTransactionId!;
        if (!byTx.has(t)) byTx.set(t, []);
        byTx.get(t)!.push(o.orderNumber || o.id);
    }
    const dupOrderTx = [...byTx.entries()]
        .filter(([, nums]) => nums.length > 1)
        .map(([tx, nums]) => ({ stripeTransactionId: tx, orders: nums }));

    out.punto2 = {
        listCount: euOnComList.length,
        listTotaleEuro: euOnComList.reduce((s, r) => s + r.eur, 0),
        matchedOnCom: matched9.length,
        missingOnCom: missing9,
        matched: matched9,
        gatewayMultiOrderViaMovement: multiOrderTx,
        gatewayMultiOrderViaOrderField: dupOrderTx,
        perimeterClaim: {
            total43: 43,
            totalEuro: 2559.81,
            onComFrom2Jul: { n: 9, euro: 592.89 },
            isabellaCarnet: 299.9,
            unregistered: { n: 33, euro: 1667.02 },
        },
    };

    // ——— Punto 3: T2 gateway + orders ———
    const t2Start = new Date(2026, 3, 1);
    const t2End = new Date(2026, 5, 30, 23, 59, 59, 999);

    const stripeT2 = await prisma.stripeFinanceMovement.findMany({
        where: {
            createdAtStripe: { gte: t2Start, lte: t2End },
        },
        select: {
            id: true,
            stripeId: true,
            type: true,
            amountCents: true,
            netCents: true,
            feeCents: true,
            orderId: true,
            createdAtStripe: true,
        },
    });

    const typeCounts: Record<string, { n: number; amount: number }> = {};
    for (const m of stripeT2) {
        const t = m.type || 'null';
        if (!typeCounts[t]) typeCounts[t] = { n: 0, amount: 0 };
        typeCounts[t].n++;
        typeCounts[t].amount += Math.abs(m.amountCents || 0);
    }

    // Customer charges heuristic (reference: 33 / €1524.86)
    const chargeLike = stripeT2.filter((m) => {
        const t = (m.type || '').toLowerCase();
        if (/payout|transfer|refund|fee|adjustment|reserved|hold|release|network/.test(t)) return false;
        if (/charge|payment|payment_intent|capture/.test(t)) return true;
        // positive amount without payout
        return (m.amountCents || 0) > 0 && !/payout/i.test(t);
    });
    const refunds = stripeT2.filter((m) => /refund/i.test(m.type || ''));

    const chargeWithOrder = chargeLike.filter((m) => m.orderId);
    const chargeWithoutOrder = chargeLike.filter((m) => !m.orderId);

    // PayPal T2
    const paypalT2 = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceType: 'PAYPAL_MOVEMENT',
            accountingDate: { gte: t2Start, lte: t2End },
        },
        select: {
            id: true,
            totalCents: true,
            category: true,
            orderId: true,
            description: true,
            metadataJson: true,
            sourceKey: true,
        },
    });
    const ppByCat: Record<string, { n: number; amount: number }> = {};
    for (const e of paypalT2) {
        const c = e.category || 'null';
        if (!ppByCat[c]) ppByCat[c] = { n: 0, amount: 0 };
        ppByCat[c].n++;
        ppByCat[c].amount += Math.abs(e.totalCents);
    }
    const ppIncassi = paypalT2.filter((e) => e.totalCents > 0);
    const ppWithoutOrder = ppIncassi.filter((e) => !e.orderId);

    // Orders T2 by status — filter createdAt
    const ordersT2 = await prisma.order.groupBy({
        by: ['status'],
        where: {
            deletedAt: null,
            isTest: false,
            createdAt: { gte: t2Start, lte: t2End },
        },
        _count: { _all: true },
    });
    const ordersT2Paid = await prisma.order.count({
        where: {
            deletedAt: null,
            isTest: false,
            partnerPaymentStatus: 'PAID',
            createdAt: { gte: t2Start, lte: t2End },
        },
    });
    const ordersT2All = await prisma.order.findMany({
        where: {
            deletedAt: null,
            isTest: false,
            createdAt: { gte: t2Start, lte: t2End },
        },
        select: {
            orderNumber: true,
            status: true,
            partnerPaymentStatus: true,
            createdAt: true,
            buyerFullName: true,
            totalPriceCents: true,
            grossAmount: true,
            stripeTransactionId: true,
        },
        orderBy: { createdAt: 'asc' },
    });

    // EU in T2 from stripe_eu or CSV
    const euInT2Db = ordersT2All.filter(
        (o) =>
            (o.stripeTransactionId || '').includes('stripe_eu') ||
            /eu/i.test(o.stripeTransactionId || '')
    );

    // Owner list Apr-Jun unregistered (from user message - those without "Sito . com")
    const ownerAprJun = [
        { date: '2026-06-16', name: 'Rosetta Paladino', eur: 49.46 },
        { date: '2026-06-05', name: 'cyrille magali Maman-Sernaglia', eur: 89.99 },
        { date: '2026-05-25', name: 'Petra Manakova', eur: 84.98 },
        { date: '2026-05-16', name: 'Maria Puliafico', eur: 49.99 },
        { date: '2026-05-03', name: 'Maria ANTONIA Pozzi', eur: 53.48 },
        { date: '2026-05-03', name: 'Isabella Cesaroni', eur: 284.9, note: 'carnet 11 ordini' },
        { date: '2026-04-29', name: 'Rosetta Paladino', eur: 45.97 },
        { date: '2026-04-28', name: 'Silvia Tregnaghi', eur: 54.98 },
        { date: '2026-04-27', name: 'Famiglia Deotti-Buzzi', eur: 39.99 },
        { date: '2026-04-20', name: "LUCIANO MAMMI'", eur: 59.98 },
        { date: '2026-04-20', name: 'Elena Lombardi', eur: 39.99 },
        { date: '2026-04-16', name: 'Rosaria Di Pasquale', eur: 29.99 },
        { date: '2026-04-01', name: 'Cristiano Mariani', eur: 29.99 },
    ];

    // 77 vs 97
    const soldMap = await loadSoldUnitsByProductId('all');
    let soldSum = 0;
    for (const v of soldMap.values()) soldSum += v;
    const itemAgg = await prisma.orderItem.aggregate({
        _sum: { quantity: true },
        _count: { _all: true },
    });
    const itemsOnCancelled = await prisma.orderItem.aggregate({
        where: { order: { status: 'CANCELLED', deletedAt: null, isTest: false } },
        _sum: { quantity: true },
        _count: { _all: true },
    });
    const itemsOnTest = await prisma.orderItem.aggregate({
        where: { order: { isTest: true } },
        _sum: { quantity: true },
        _count: { _all: true },
    });
    const itemsOnDeleted = await prisma.orderItem.aggregate({
        where: { order: { deletedAt: { not: null } } },
        _sum: { quantity: true },
        _count: { _all: true },
    });
    const itemsIncluded = await prisma.orderItem.aggregate({
        where: {
            order: { deletedAt: null, isTest: false, status: { not: 'CANCELLED' } },
        },
        _sum: { quantity: true },
        _count: { _all: true },
    });

    out.punto3 = {
        dateFilter: 'Order.createdAt / StripeFinanceMovement.createdAtStripe / Ledger.accountingDate — T2 = 2026-04-01..2026-06-30',
        stripeT2: {
            totalRows: stripeT2.length,
            byType: typeCounts,
            chargeLike: {
                n: chargeLike.length,
                amountEuro: chargeLike.reduce((s, m) => s + Math.abs(m.amountCents || 0), 0) / 100,
                withOrder: chargeWithOrder.length,
                withoutOrder: chargeWithoutOrder.length,
                withoutOrderSample: chargeWithoutOrder.slice(0, 40).map((m) => ({
                    stripeId: m.stripeId,
                    type: m.type,
                    amountEuro: (m.amountCents || 0) / 100,
                    date: m.createdAtStripe?.toISOString().slice(0, 10),
                })),
            },
            refunds: {
                n: refunds.length,
                amountEuro: refunds.reduce((s, m) => s + Math.abs(m.amountCents || 0), 0) / 100,
            },
            referenceHand: { stripe: '33 / €1524.86', paypal: '35 / €593.79', refunds: '3 / €139.95' },
        },
        paypalT2: {
            totalRows: paypalT2.length,
            byCategory: ppByCat,
            positiveIncassi: {
                n: ppIncassi.length,
                amountEuro: ppIncassi.reduce((s, e) => s + e.totalCents, 0) / 100,
                withoutOrder: ppWithoutOrder.length,
            },
        },
        ordersT2: {
            byStatus: Object.fromEntries(ordersT2.map((g) => [g.status, g._count._all])),
            paidCount: ordersT2Paid,
            allNonTest: ordersT2All.length,
            list: ordersT2All.map((o) => ({
                orderNumber: o.orderNumber,
                status: o.status,
                payment: o.partnerPaymentStatus,
                date: o.createdAt.toISOString().slice(0, 10),
                buyer: o.buyerFullName,
                euro: o.grossAmount ?? o.totalPriceCents / 100,
            })),
            euTaggedInT2: euInT2Db.length,
            ownerListAprJunUnregisteredCount: ownerAprJun.length,
            noteEuDiff:
                'Lista titolare Apr–Giu: 13 vendite .eu non su .com. DB T2 PAID≈10 (mix UNKNOWN/EU). I 9 .eu→.com partono dal 02/07 (T3), non sono nel T2.',
        },
        sold77vs97: {
            catalogSoldUnitsAll: soldSum,
            orderItemRowsTotal: itemAgg._count._all,
            orderItemQtyTotal: itemAgg._sum.quantity,
            includedNonCancelledNonTest: {
                rows: itemsIncluded._count._all,
                qty: itemsIncluded._sum.quantity,
            },
            onCancelled: {
                rows: itemsOnCancelled._count._all,
                qty: itemsOnCancelled._sum.quantity,
            },
            onTest: { rows: itemsOnTest._count._all, qty: itemsOnTest._sum.quantity },
            onDeleted: { rows: itemsOnDeleted._count._all, qty: itemsOnDeleted._sum.quantity },
            gapExplanation:
                'Venduti catalogo = Σ quantity OrderItem su ordini non CANCELLED/non test/non deleted. 97 = tutte le righe OrderItem. Delta ≈ righe su ordini CANCELLED (e/o test/deleted).',
        },
    };

    // ——— Punto 4 catalog ———
    const products = await prisma.product.findMany({
        where: { deletedAt: null },
        select: {
            name: true,
            vatRatePercent: true,
            floristStandardCostCents: true,
            slug: true,
        },
        orderBy: { name: 'asc' },
    });
    const nastroPiccoli = products.find((p) => /nastro piccoli/i.test(p.name));
    const zeroCost = products.filter((p) =>
        /^(Messaggio|Foto stato di fatto|Nastro commemorativo)$/i.test(p.name.trim()) ||
        /messaggio$|foto stato|nastro commemorativo/i.test(p.name)
    );
    const missingVat = products.filter((p) => p.vatRatePercent !== 10 && p.vatRatePercent !== 22);
    const costZero = products.filter((p) => p.floristStandardCostCents === 0);
    const costNull = products.filter((p) => p.floristStandardCostCents == null);

    out.punto4 = {
        nastroPiccoliAmici: nastroPiccoli,
        confirmedZeroCostProducts: zeroCost.map((p) => ({
            name: p.name,
            vatRatePercent: p.vatRatePercent,
            floristStandardCostCents: p.floristStandardCostCents,
        })),
        missingVatCount: missingVat.length,
        costZeroCount: costZero.length,
        costNullCount: costNull.length,
        schemaNote:
            'Oggi floristStandardCostCents Int? — 0 e null sono distinguibili. Per prodotti futuri: usare null=non compilato, 0=confermato gratis. Nessuna migration aggiuntiva necessaria se si rispetta la convenzione.',
    };

    const outPath = path.join(
        process.cwd(),
        'docs/verbali/dossier_metodo_v16_indagine_punti_1_4.json'
    );
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
    console.log(JSON.stringify(out, null, 2));
    console.log('WROTE', outPath);
}

main()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
