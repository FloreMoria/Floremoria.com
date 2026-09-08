/**
 * Raffinamento: overlap Report vs Youdox (SDI_XML only) + Amanda + match gateway↔ordini.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();
if (process.env.DATABASE_URL_UNPOOLED) process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;

import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import prisma from '../lib/prisma';

function normVendor(s: string) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}
function normDocNum(s: string) {
    return String(s || '')
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/^0+/, '');
}
function parseItDate(v: unknown): string | null {
    if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
    const s = String(v || '').trim();
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return null;
}
function reportKey(r: { vendor: string; piva: string; date: string; docNum: string }) {
    const who = r.piva ? `PIVA:${r.piva.replace(/\s/g, '')}` : `V:${normVendor(r.vendor)}`;
    return `${who}|${r.date}|${normDocNum(r.docNum)}`;
}

async function main() {
    const reportByKey = new Map<
        string,
        {
            vendor: string;
            piva: string;
            date: string;
            docNum: string;
            totaleCents: number;
            imponibileCents: number;
        }
    >();
    for (const f of [
        '/Users/floremoria/Downloads/Report_Fatture_ricevute_2026.xlsx',
        '/Users/floremoria/Downloads/Report_Fatture_ricevute_2026-T1.xlsx',
        '/Users/floremoria/Downloads/Report_Fatture_ricevute_2026-T2.xlsx',
        '/Users/floremoria/Downloads/Report_Fatture_ricevute_2026-T3.xlsx',
    ]) {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.readFile(f);
        wb.worksheets[0].eachRow((row, rn) => {
            if (rn === 1) return;
            const v = [...row.values].slice(1);
            const date = parseItDate(v[1]);
            if (!date || !date.startsWith('2026')) return;
            const imponibile = Math.round(Number(v[8] || 0) * 100);
            const iva = Math.round(Number(v[9] || 0) * 100);
            const r = {
                vendor: String(v[5] || ''),
                piva: String(v[6] || ''),
                date,
                docNum: String(v[4] || ''),
                totaleCents: imponibile + iva,
                imponibileCents: imponibile,
            };
            const k = reportKey(r);
            if (!reportByKey.has(k)) reportByKey.set(k, r);
        });
    }

    const manuals = await prisma.manualFinanceExpense.findMany({
        where: {
            expenseDate: {
                gte: new Date(2026, 0, 1),
                lte: new Date(2026, 11, 31, 23, 59, 59, 999),
            },
        },
    });
    const bySource: Record<string, number> = {};
    for (const m of manuals) {
        const meta = (m.metadataJson || {}) as Record<string, unknown>;
        const source = String(meta.source || 'UNKNOWN');
        bySource[source] = (bySource[source] || 0) + 1;
    }

    const youdox = manuals
        .filter((m) => {
            const meta = (m.metadataJson || {}) as Record<string, unknown>;
            return String(meta.source || '') === 'SDI_XML';
        })
        .map((m) => {
            const meta = (m.metadataJson || {}) as Record<string, unknown>;
            return {
                id: m.id,
                vendor: m.vendorName,
                piva: String(meta.vendorVat || meta.vatNumber || meta.piva || ''),
                date: m.expenseDate.toISOString().slice(0, 10),
                docNum: String(
                    meta.invoiceNumber || meta.documentNumber || meta.numero || ''
                ),
                totaleCents: m.totalCents,
                netCents: m.netCents,
            };
        });

    const used = new Set<string>();
    const overlaps: Array<Record<string, unknown>> = [];
    for (const [k, rep] of reportByKey) {
        const match = youdox.find((y) => {
            if (used.has(y.id)) return false;
            if (reportKey(y) === k) return true;
            return (
                y.date === rep.date &&
                normDocNum(y.docNum) === normDocNum(rep.docNum) &&
                (normVendor(y.vendor) === normVendor(rep.vendor) ||
                    (!!y.piva &&
                        !!rep.piva &&
                        y.piva.replace(/\s/g, '') === rep.piva.replace(/\s/g, '')))
            );
        });
        if (match) {
            used.add(match.id);
            overlaps.push({
                date: rep.date,
                vendor: rep.vendor,
                docNum: rep.docNum,
                reportTotaleEuro: rep.totaleCents / 100,
                reportImponibileEuro: rep.imponibileCents / 100,
                youdoxTotaleEuro: match.totaleCents / 100,
            });
        }
    }

    const punto1 = {
        channels: {
            report: 'Report_Fatture_ricevute_*.xlsx → ManualFinanceExpense source=SDI_XLSX',
            youdox: 'YouDOX sync → ManualFinanceExpense source=SDI_XML',
        },
        bySource,
        reportUnique2026: reportByKey.size,
        youdoxSdiXml2026: youdox.length,
        overlapCount: overlaps.length,
        overlapTotaleDocumentoEuro:
            Math.round(overlaps.reduce((s, o) => s + Number(o.reportTotaleEuro) * 100, 0)) / 100,
        overlapImponibileEuro:
            Math.round(overlaps.reduce((s, o) => s + Number(o.reportImponibileEuro) * 100, 0)) /
            100,
        overlaps,
    };

    // Amanda
    const amanda = await prisma.order.findMany({
        where: {
            deletedAt: null,
            OR: [
                { buyerFullName: { contains: 'Favot', mode: 'insensitive' } },
                { buyerFullName: { contains: 'Amanda', mode: 'insensitive' } },
                { totalPriceCents: 10998 },
            ],
        },
        select: {
            orderNumber: true,
            createdAt: true,
            buyerFullName: true,
            totalPriceCents: true,
            grossAmount: true,
            partnerPaymentStatus: true,
            status: true,
            isTest: true,
            stripeTransactionId: true,
        },
    });

    // 9 list re-match including soft windows
    const list9 = [
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
    const fromJul = await prisma.order.findMany({
        where: {
            deletedAt: null,
            isTest: false,
            createdAt: { gte: new Date(2026, 6, 1) },
        },
        select: {
            id: true,
            orderNumber: true,
            createdAt: true,
            buyerFullName: true,
            totalPriceCents: true,
            grossAmount: true,
            partnerPaymentStatus: true,
            stripeTransactionId: true,
        },
    });
    const matched9 = [];
    const missing9 = [];
    for (const row of list9) {
        const cents = Math.round(row.eur * 100);
        const hit = fromJul.find((o) => {
            const g =
                o.grossAmount != null ? Math.round(o.grossAmount * 100) : o.totalPriceCents;
            const nameOk =
                normVendor(o.buyerFullName || '').includes(normVendor(row.name).split(' ')[0]) ||
                normVendor(row.name)
                    .split(' ')
                    .filter((t) => t.length > 3)
                    .some((t) => normVendor(o.buyerFullName || '').includes(t));
            const amountOk = Math.abs(g - cents) <= 1;
            const d = o.createdAt.toISOString().slice(0, 10);
            const dateOk = Math.abs(Date.parse(d) - Date.parse(row.date)) <= 3 * 86400000;
            return amountOk && (nameOk || dateOk) && (nameOk || amountOk);
        });
        // stricter
        const hit2 =
            fromJul.find((o) => {
                const g =
                    o.grossAmount != null ? Math.round(o.grossAmount * 100) : o.totalPriceCents;
                const amountOk = Math.abs(g - cents) <= 1;
                const nameParts = normVendor(row.name).split(' ').filter((t) => t.length > 3);
                const nameOk = nameParts.some((t) =>
                    normVendor(o.buyerFullName || '').includes(t)
                );
                const d = o.createdAt.toISOString().slice(0, 10);
                const dateOk = Math.abs(Date.parse(d) - Date.parse(row.date)) <= 2 * 86400000;
                return amountOk && nameOk && dateOk;
            }) || null;
        if (hit2) {
            matched9.push({
                list: row,
                orderNumber: hit2.orderNumber,
                payment: hit2.partnerPaymentStatus,
                buyer: hit2.buyerFullName,
                createdAt: hit2.createdAt.toISOString().slice(0, 10),
                stripeTransactionId: hit2.stripeTransactionId,
            });
        } else {
            missing9.push({ row, near: hit || null, amandaSearch: amanda });
        }
    }

    // Stripe T2 unique bare + match orders
    const stripe = await prisma.stripeFinanceMovement.findMany({
        where: {
            createdAtStripe: {
                gte: new Date(2026, 3, 1),
                lte: new Date(2026, 5, 30, 23, 59, 59, 999),
            },
            type: { in: ['charge', 'payment'] },
        },
    });
    const byBare = new Map<string, (typeof stripe)[0]>();
    for (const m of stripe) {
        const bare = (m.stripeId || '').replace(/^stripe_(eu_)?tx_/, '');
        const prev = byBare.get(bare);
        if (!prev || (m.stripeId || '').startsWith('stripe_')) {
            // prefer raw txn_ over stripe_tx_ duplicate? keep first positive
            if (!prev) byBare.set(bare, m);
        }
    }
    // Prefer entries without stripe_tx_ prefix when both exist
    byBare.clear();
    for (const m of stripe) {
        const bare = (m.stripeId || '').replace(/^stripe_(eu_)?tx_/, '');
        const prev = byBare.get(bare);
        if (!prev) byBare.set(bare, m);
        else if ((prev.stripeId || '').startsWith('stripe_') && !(m.stripeId || '').startsWith('stripe_')) {
            byBare.set(bare, m);
        }
    }
    const uniquePos = [...byBare.values()].filter((m) => (m.amountCents || 0) > 0);
    const uniqueSum = uniquePos.reduce((s, m) => s + Math.abs(m.amountCents || 0), 0);

    const ordersT2win = await prisma.order.findMany({
        where: {
            deletedAt: null,
            isTest: false,
            createdAt: { gte: new Date(2026, 2, 25), lte: new Date(2026, 6, 10) },
        },
    });
    const unmatched: Array<Record<string, unknown>> = [];
    let matchedCharges = 0;
    for (const m of uniquePos) {
        const day = m.createdAtStripe.toISOString().slice(0, 10);
        const hit = ordersT2win.find((o) => {
            const g =
                o.grossAmount != null ? Math.round(o.grossAmount * 100) : o.totalPriceCents;
            const od = o.createdAt.toISOString().slice(0, 10);
            return (
                Math.abs(g - Math.abs(m.amountCents || 0)) <= 1 &&
                Math.abs(Date.parse(od) - Date.parse(day)) <= 2 * 86400000
            );
        });
        if (hit) matchedCharges++;
        else
            unmatched.push({
                stripeId: m.stripeId,
                type: m.type,
                eur: (m.amountCents || 0) / 100,
                day,
            });
    }

    // PayPal: RICAVI positive vs all positive
    const ppRicavi = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceType: 'PAYPAL_MOVEMENT',
            accountingDate: {
                gte: new Date(2026, 3, 1),
                lte: new Date(2026, 5, 30, 23, 59, 59, 999),
            },
            category: 'RICAVI_VENDITE',
            totalCents: { gt: 0 },
        },
    });
    // Hand ref 35 / 593.79 — try all positive non-saas
    const ppAllPos = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceType: 'PAYPAL_MOVEMENT',
            accountingDate: {
                gte: new Date(2026, 3, 1),
                lte: new Date(2026, 5, 30, 23, 59, 59, 999),
            },
            totalCents: { gt: 0 },
            category: { notIn: ['SPESE_SAAS', 'PAYPAL_PAYOUT'] },
        },
    });

    // Item gap exact
    const allItems = await prisma.orderItem.findMany({
        include: {
            order: { select: { status: true, isTest: true, deletedAt: true, orderNumber: true } },
        },
    });
    const buckets: Record<string, number> = {
        included: 0,
        cancelled_only: 0,
        test_only: 0,
        deleted_only: 0,
        test_and_deleted: 0,
        cancelled_and_deleted: 0,
        other: 0,
    };
    for (const it of allItems) {
        const o = it.order;
        const del = !!o.deletedAt;
        const test = o.isTest;
        const can = o.status === 'CANCELLED';
        if (!del && !test && !can) buckets.included++;
        else if (del && test) buckets.test_and_deleted++;
        else if (del && can) buckets.cancelled_and_deleted++;
        else if (del) buckets.deleted_only++;
        else if (test) buckets.test_only++;
        else if (can) buckets.cancelled_only++;
        else buckets.other++;
    }

    const out = {
        punto1,
        punto2: {
            matched9,
            missing9: missing9.map((m) => m.row),
            amandaCandidates: amanda,
            matchedCount: matched9.length,
            listTotaleEuro: 592.89,
        },
        punto3_refine: {
            stripeUniqueChargePaymentPositive: {
                n: uniquePos.length,
                amountEuro: uniqueSum / 100,
                matchedToOrderByAmountDate: matchedCharges,
                unmatchedToOrder: unmatched,
            },
            paypalRicaviPositive: {
                n: ppRicavi.length,
                amountEuro: ppRicavi.reduce((s, e) => s + e.totalCents, 0) / 100,
            },
            paypalAllPositiveExclSaasPayout: {
                n: ppAllPos.length,
                amountEuro: ppAllPos.reduce((s, e) => s + e.totalCents, 0) / 100,
            },
            itemBuckets: { totalRows: allItems.length, ...buckets },
        },
    };

    const outPath = path.join(
        process.cwd(),
        'docs/verbali/dossier_metodo_v16_indagine_punti_1_4_refine.json'
    );
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
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
