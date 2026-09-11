/**
 * Pass 2: reverse stripe_tx_po_* residui; inbound per id-suffix CSV; ricalcola C13.
 */
import fs from 'node:fs';
import path from 'node:path';
import prisma from '@/lib/prisma';
import {
    setPaypalDeclaredBalance,
    setStripeDeclaredBalance,
    getStripeDeclaredBalance,
    getPaypalDeclaredBalance,
} from '@/lib/financial/gatewayDeclaredBalance';
import { sumTransitLedgerCents } from '@/lib/financial/gatewayTransitBalance';
import { controlC13 } from '@/lib/financial/dossierFiscalControls';
import { appendLedgerEntries } from '@/lib/financial/historicalLedgerSync';
import {
    LEDGER_PAYPAL_ACCOUNT,
    LEDGER_STRIPE_ACCOUNT,
} from '@/lib/financial/companyBankDetails';
import { ACCOUNT_RICAVI_VENDITE } from '@/lib/financial/chartOfAccounts';
import type { LedgerEntryInput } from '@/lib/financial/historicalLedgerTypes';

const YEAR = 2026;
const CSV = path.join(process.cwd(), 'docs/verbali/FloreMoria_Ordini_Operativi.csv');
const OUT = path.join(process.cwd(), 'docs/verbali/11-09-2026-diag-payout-inbound-c13.json');

function euro(c: number) {
    return Math.round(c) / 100;
}

function parseActive(file: string) {
    const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    const lines = raw.split(/\r?\n/).filter((l) => l.trim());
    const h = lines[0]!.split(';');
    const idx = (n: string) => h.indexOf(n);
    const rows = [];
    for (const line of lines.slice(1)) {
        const c = line.split(';');
        const orderNumber = (c[idx('ID Ordine')] || '').trim();
        if (!orderNumber) continue;
        const priceRaw = (c[idx('Prezzo')] || '').replace('€', '').trim().replace(',', '.');
        const priceCents = Math.round(parseFloat(priceRaw || '0') * 100) || 0;
        if (priceCents <= 0) continue;
        rows.push({ orderNumber, priceCents });
    }
    return rows;
}

async function resolveOrder(csvId: string) {
    const byNumber = await prisma.order.findFirst({
        where: { orderNumber: csvId },
        select: {
            id: true,
            orderNumber: true,
            createdAt: true,
            totalPriceCents: true,
            grossAmount: true,
            paymentMethodLabel: true,
            buyerFullName: true,
            stripeTransactionId: true,
        },
    });
    if (byNumber) return byNumber;
    const suffix = csvId.toLowerCase();
    const all = await prisma.order.findMany({
        where: { id: { endsWith: suffix } },
        select: {
            id: true,
            orderNumber: true,
            createdAt: true,
            totalPriceCents: true,
            grossAmount: true,
            paymentMethodLabel: true,
            buyerFullName: true,
            stripeTransactionId: true,
        },
        take: 3,
    });
    return all[0] || null;
}

async function main() {
    const start = new Date(`${YEAR}-01-01T00:00:00.000Z`);
    const end = new Date(`${YEAR}-12-31T23:59:59.999Z`);

    // Reverse non-canonical STRIPE_PAYOUT keys (keep only STRIPE_PAYOUT:po_XXXX)
    const payouts = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceKey: { startsWith: 'STRIPE_PAYOUT:' },
        },
        select: { id: true, sourceKey: true, totalCents: true, accountingDate: true },
    });
    const canonical = /^STRIPE_PAYOUT:po_[A-Za-z0-9]+$/;
    const seenPo = new Set<string>();
    let reversedPo = 0;
    const extraDups: Array<{ date: string; euro: number; sourceA: string; sourceB: string; reason: string }> =
        [];
    for (const r of payouts) {
        const key = r.sourceKey;
        const m = key.match(/po_[A-Za-z0-9]+/);
        const po = m?.[0] || '';
        if (!canonical.test(key)) {
            extraDups.push({
                date: r.accountingDate.toISOString().slice(0, 10),
                euro: euro(Math.abs(r.totalCents)),
                sourceA: key,
                sourceB: po ? `STRIPE_PAYOUT:${po}` : '—',
                reason: 'prefisso non canonico (stripe_tx_po_ / altro) vs po_*',
            });
            await prisma.financialLedgerEntry.update({
                where: { id: r.id },
                data: { reversedAt: new Date() },
            });
            reversedPo += 1;
            continue;
        }
        if (seenPo.has(po)) {
            extraDups.push({
                date: r.accountingDate.toISOString().slice(0, 10),
                euro: euro(Math.abs(r.totalCents)),
                sourceA: key,
                sourceB: `già ${po}`,
                reason: 'secondo STRIPE_PAYOUT canonico stesso po_*',
            });
            await prisma.financialLedgerEntry.update({
                where: { id: r.id },
                data: { reversedAt: new Date() },
            });
            reversedPo += 1;
        } else {
            seenPo.add(po);
        }
    }

    // Ensure missing bare po from movements
    const moves = await prisma.stripeFinanceMovement.findMany({
        where: {
            OR: [{ type: 'payout' }, { reportingCategory: 'payout' }],
            createdAtStripe: { gte: start, lte: end },
        },
        select: {
            stripeId: true,
            payoutId: true,
            amountCents: true,
            createdAtStripe: true,
            description: true,
            orderId: true,
        },
    });
    const { LEDGER_FINECO_ACCOUNT, LEDGER_STRIPE_ACCOUNT: STRIPE_ACC } = await import(
        '@/lib/financial/companyBankDetails'
    );
    const candidates = [];
    const best = new Map<string, (typeof moves)[number]>();
    for (const m of moves) {
        const po =
            (m.payoutId?.startsWith('po_') && m.payoutId) ||
            (m.stripeId.match(/po_[A-Za-z0-9]+/) || [])[0] ||
            null;
        if (!po || /txn_/i.test(po)) continue;
        if (!best.has(po)) best.set(po, m);
    }
    for (const [po, m] of best) {
        const abs = Math.abs(m.amountCents);
        if (abs <= 0) continue;
        candidates.push({
            sourceKey: `STRIPE_PAYOUT:${po}`.slice(0, 180),
            sourceType: 'STRIPE_MOVEMENT' as const,
            sourceId: po.slice(0, 128),
            direction: 'USCITA' as const,
            category: 'TRASFERIMENTO_INTERNO' as const,
            accountingDate: m.createdAtStripe,
            description: `Payout Stripe → Fineco — ${m.description || po}`,
            counterpartyName: 'FinecoBank',
            netCents: -abs,
            vatRate: 0,
            vatCents: 0,
            totalCents: -abs,
            reconciliationStatus: 'MATCHED',
            documentRef: po,
            orderId: m.orderId,
            entryNature: 'TRANSITO' as const,
            settlementStatus: 'MATCHED' as const,
            metadataJson: {
                type: 'payout',
                payoutId: po,
                dareAccount: LEDGER_FINECO_ACCOUNT,
                avereAccount: STRIPE_ACC,
                transitLeg: 'payout_to_bank',
            },
        });
    }
    const insPo = await appendLedgerEntries(candidates);

    // Inbound for all active CSV rows via number or id suffix
    const active = parseActive(CSV);
    const existing = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            OR: [
                { sourceKey: { startsWith: 'STRIPE_TX:' } },
                { sourceKey: { startsWith: 'PAYPAL_TX:' } },
                { sourceKey: { startsWith: 'MANUAL_INBOUND:' } },
            ],
        },
        select: { orderId: true, sourceKey: true },
        take: 30000,
    });
    const covered = new Set(existing.map((e) => e.orderId).filter(Boolean) as string[]);

    const inbound: LedgerEntryInput[] = [];
    const unresolved: string[] = [];
    let already = 0;
    for (const a of active) {
        const o = await resolveOrder(a.orderNumber);
        if (!o) {
            unresolved.push(a.orderNumber);
            continue;
        }
        if (covered.has(o.id)) {
            already += 1;
            continue;
        }
        const tok = o.stripeTransactionId?.trim();
        if (
            tok &&
            existing.some((e) => e.sourceKey.includes(tok) || e.sourceKey.includes(tok.replace(/^stripe_(?:com|eu)_tx_/i, '').replace(/^stripe_tx_/i, '')))
        ) {
            covered.add(o.id);
            already += 1;
            continue;
        }
        const amount =
            o.grossAmount != null
                ? Math.round(Number(o.grossAmount) * 100)
                : o.totalPriceCents || a.priceCents;
        const isPaypal = /paypal/i.test(o.paymentMethodLabel || '');
        inbound.push({
            sourceKey: `MANUAL_INBOUND:${o.id}`.slice(0, 180),
            sourceType: 'ORDER',
            sourceId: o.id,
            direction: 'ENTRATA',
            category: 'RICAVI_VENDITE',
            accountingDate: o.createdAt,
            description: `Incasso da identificare — ${o.orderNumber || a.orderNumber}`,
            counterpartyName: o.buyerFullName || 'Cliente',
            netCents: amount,
            vatRate: 0,
            vatCents: 0,
            totalCents: amount,
            reconciliationStatus: 'UNMATCHED',
            documentRef: o.orderNumber || a.orderNumber,
            orderId: o.id,
            entryNature: 'TRANSITO',
            settlementStatus: 'OPEN',
            metadataJson: {
                dareAccount: isPaypal ? LEDGER_PAYPAL_ACCOUNT : LEDGER_STRIPE_ACCOUNT,
                avereAccount: ACCOUNT_RICAVI_VENDITE,
                transitLeg: 'customer_payment',
                paymentStatus: 'DA_IDENTIFICARE',
                via: 'operativi_inbound_75_pass2',
                csvId: a.orderNumber,
            },
        });
        covered.add(o.id);
    }
    const inboundIns = await appendLedgerEntries(inbound);

    await setStripeDeclaredBalance({
        balanceCents: 10000,
        asOf: new Date().toISOString().slice(0, 10),
        note: 'Cruscotto Stripe €100',
    });
    await setPaypalDeclaredBalance({
        balanceCents: 0,
        asOf: new Date().toISOString().slice(0, 10),
        note: 'Cruscotto PayPal €0',
    });

    const stripePayouts = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceKey: { startsWith: 'STRIPE_PAYOUT:' },
            accountingDate: { gte: start, lte: end },
        },
        select: { totalCents: true, sourceKey: true },
    });
    const paypalPayouts = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            OR: [
                { sourceKey: { startsWith: 'PAYPAL_PAYOUT:' } },
                { category: 'PAYPAL_PAYOUT' },
            ],
            accountingDate: { gte: start, lte: end },
        },
        select: { totalCents: true },
    });
    const sumAbs = (rows: { totalCents: number }[]) =>
        rows.reduce((s, r) => s + Math.abs(r.totalCents), 0);

    const banks = await prisma.bankStatementLine.findMany({
        where: {
            amountCents: { gt: 0 },
            OR: [
                { accountingDate: { gte: start, lte: end } },
                { valueDate: { gte: start, lte: end } },
            ],
        },
        select: { description: true, amountCents: true },
    });
    const finecoGw = banks.filter((b) => /STRIPE|PAYPAL|PAY PAL/i.test(b.description || ''));

    const stripeBal = await sumTransitLedgerCents(['10300', 'Banca c/o Stripe', 'Conto Stripe']);
    const paypalBal = await sumTransitLedgerCents(['10200', 'Banca c/o PayPal', 'Conto PayPal']);
    const c13 = await controlC13(YEAR, 3);

    const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    const report = {
        ...prev,
        pass2: {
            reversedNonCanonicalPo: reversedPo,
            insertedPo: insPo,
            extraDups,
            inboundInserted: inboundIns.inserted,
            inboundAlready: already,
            unresolved,
            coverageActive: {
                activeCsv: active.length,
                covered: covered.size,
                // recount vs resolved
            },
        },
        payoutAfterPass2: {
            stripeN: stripePayouts.length,
            stripeEuro: euro(sumAbs(stripePayouts)),
            paypalN: paypalPayouts.length,
            paypalEuro: euro(sumAbs(paypalPayouts)),
            totalEuro: euro(sumAbs(stripePayouts) + sumAbs(paypalPayouts)),
            sampleKeys: stripePayouts.slice(0, 5).map((r) => r.sourceKey),
        },
        finecoPass2: {
            totalEuro: euro(finecoGw.reduce((s, b) => s + b.amountCents, 0)),
            deltaTransitMinusFineco:
                euro(sumAbs(stripePayouts) + sumAbs(paypalPayouts)) -
                euro(finecoGw.reduce((s, b) => s + b.amountCents, 0)),
        },
        balancesPass2: {
            stripeLedgerEuro: stripeBal / 100,
            paypalLedgerEuro: paypalBal / 100,
            total: (stripeBal + paypalBal) / 100,
            declaredStripe: (await getStripeDeclaredBalance())?.balanceCents! / 100,
            declaredPaypal: (await getPaypalDeclaredBalance())?.balanceCents! / 100,
        },
        c13Pass2: {
            passed: c13.passed,
            verifiable: c13.verifiable,
            detail: c13.detail,
            gaps: c13.transitBalanceGaps,
        },
        count75Note:
            'taxRegister=74 perché FT-RM-26-002 (DELIVERED_UNPAID, €52,48) è escluso dal perimetro ricavi automatico; lista operativa lo conta tra i 75 attivi.',
    };
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(
        JSON.stringify(
            {
                payoutAfterPass2: report.payoutAfterPass2,
                finecoPass2: report.finecoPass2,
                balancesPass2: report.balancesPass2,
                c13: report.c13Pass2.detail,
                inbound: {
                    inserted: inboundIns.inserted,
                    already,
                    unresolved,
                    covered: covered.size,
                    active: active.length,
                },
                extraDupN: extraDups.length,
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
