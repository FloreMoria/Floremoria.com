/**
 * Audit riconciliazione trimestre: Fineco ↔ gateway Stripe/PayPal ↔ Prima Nota · C1–C3 · doppioni.
 *
 * Uso:
 *   npx tsx scripts/audit-quarter-gateway-bank-reconcile.ts
 *   npx tsx scripts/audit-quarter-gateway-bank-reconcile.ts --year=2026 --quarter=3
 *
 * Output: docs/verbali/YYYY-MM-DD-audit-riconciliazione-T{n}.json (+ .md)
 */
import { loadEnvFiles } from '@/lib/loadEnvFiles';
loadEnvFiles();
if (process.env.DATABASE_URL_UNPOOLED?.trim()) {
    process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED.trim();
}

import fs from 'node:fs';
import path from 'node:path';
import prisma from '@/lib/prisma';
import {
    controlC1,
    controlC2,
    controlC3,
} from '@/lib/financial/dossierFiscalControls';
import { resolveQuarterBounds, type TaxQuarter } from '@/lib/financial/taxQuarterly';
import {
    isGatewayRelatedFinecoMovement,
    matchGatewayPayoutsToFineco,
} from '@/lib/financial/gatewayBankMatch';
import {
    buildGatewaySyncRows,
    enrichGatewayRowsWithOrders,
    type GatewaySyncRow,
} from '@/lib/financial/gatewaySyncRows';
import { computeGatewayQuadratura } from '@/lib/financial/gatewayQuadratura';
import {
    buildCanonicalDocumentKey,
    normalizeCanonicalVat,
} from '@/lib/financial/canonicalDocumentKey';
import { buildPassiveIdentityKey } from '@/lib/financial/passiveInvoiceIdentity';

type Args = { year: number; quarter: TaxQuarter };

function parseArgs(argv: string[]): Args {
    const out: Args = {
        year: 2026,
        quarter: 3,
    };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--year' && argv[i + 1]) out.year = Number(argv[++i]);
        else if (a.startsWith('--year=')) out.year = Number(a.slice(7));
        else if (a === '--quarter' && argv[i + 1]) out.quarter = Number(argv[++i]) as TaxQuarter;
        else if (a.startsWith('--quarter=')) out.quarter = Number(a.slice(10)) as TaxQuarter;
    }
    if (![1, 2, 3, 4].includes(out.quarter)) throw new Error(`quarter invalid: ${out.quarter}`);
    return out;
}

function euro(cents: number): string {
    return (cents / 100).toFixed(2);
}

function dayKey(d: Date | string | null | undefined): string {
    if (!d) return '';
    return (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10);
}

function withinDays(a: Date, b: Date, days: number): boolean {
    const da = Date.parse(dayKey(a));
    const db = Date.parse(dayKey(b));
    if (!Number.isFinite(da) || !Number.isFinite(db)) return false;
    return Math.abs(da - db) <= days * 86400000;
}

type BankRow = {
    id: string;
    accountingDate: Date | null;
    description: string;
    amountCents: number;
    matchStatus: string | null;
    matchedOrderId: string | null;
    documentId: string;
};

function classifyGatewayBank(desc: string, amountCents: number): 'stripe' | 'paypal' | null {
    const u = desc.toUpperCase();
    if (!isGatewayRelatedFinecoMovement(desc, amountCents)) return null;
    if (/\bSTRIPE\b/.test(u)) return 'stripe';
    if (/\bPAYPAL\b/.test(u)) return 'paypal';
    return null;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const bounds = resolveQuarterBounds(args.year, args.quarter);
    const generatedAt = new Date().toISOString();

    console.info('[audit-reconcile] period', bounds.label, {
        start: bounds.start.toISOString(),
        end: bounds.end.toISOString(),
    });

    // ——— Dati base ———
    const [bankLines, stripeMovs, paypalLedger, manualExpenses, saasInvoices, c1, c2, c3] =
        await Promise.all([
            prisma.bankStatementLine.findMany({
                where: {
                    OR: [
                        { accountingDate: { gte: bounds.start, lte: bounds.end } },
                        { valueDate: { gte: bounds.start, lte: bounds.end } },
                    ],
                },
                select: {
                    id: true,
                    accountingDate: true,
                    valueDate: true,
                    description: true,
                    amountCents: true,
                    matchStatus: true,
                    matchedOrderId: true,
                    documentId: true,
                },
                orderBy: [{ accountingDate: 'asc' }],
                take: 10000,
            }),
            prisma.stripeFinanceMovement.findMany({
                where: { createdAtStripe: { gte: bounds.start, lte: bounds.end } },
                select: {
                    id: true,
                    stripeId: true,
                    sourceId: true,
                    type: true,
                    amountCents: true,
                    feeCents: true,
                    netCents: true,
                    createdAtStripe: true,
                    orderId: true,
                    description: true,
                    reportingCategory: true,
                    metadataJson: true,
                },
                take: 20000,
            }),
            prisma.financialLedgerEntry.findMany({
                where: {
                    reversedAt: null,
                    sourceKey: { startsWith: 'PAYPAL_' },
                    accountingDate: { gte: bounds.start, lte: bounds.end },
                },
                select: {
                    id: true,
                    sourceKey: true,
                    sourceType: true,
                    accountingDate: true,
                    totalCents: true,
                    netCents: true,
                    vatCents: true,
                    description: true,
                    counterpartyName: true,
                    category: true,
                    direction: true,
                    orderId: true,
                    metadataJson: true,
                    reconciliationStatus: true,
                },
                take: 20000,
            }),
            prisma.manualFinanceExpense.findMany({
                where: {
                    expenseDate: { gte: bounds.start, lte: bounds.end },
                    docType: { in: ['FATTURA', 'NOTA_CREDITO', 'RICEVUTA', 'SCONTRINO', 'AUTOFATTURA'] },
                },
                select: {
                    id: true,
                    vendorName: true,
                    totalCents: true,
                    expenseDate: true,
                    docType: true,
                    storageKind: true,
                    metadataJson: true,
                    notes: true,
                    canonicalDocKey: true,
                },
                take: 10000,
            }),
            prisma.saasForeignInvoice.findMany({
                where: {
                    OR: [
                        { invoiceDate: { gte: bounds.start, lte: bounds.end } },
                        { createdAt: { gte: bounds.start, lte: bounds.end } },
                    ],
                },
                select: {
                    id: true,
                    vendorName: true,
                    eurAmountCents: true,
                    invoiceDate: true,
                    fileName: true,
                    metadataJson: true,
                    canonicalDocKey: true,
                },
                take: 5000,
            }),
            controlC1(args.year, args.quarter),
            controlC2(args.year, args.quarter),
            controlC3(args.year, args.quarter),
        ]);

    const saasInvoicesNorm = saasInvoices.map((s) => ({
        id: s.id,
        vendorName: s.vendorName,
        totalCents: s.eurAmountCents,
        invoiceDate: s.invoiceDate,
        fileName: s.fileName,
        metadataJson: s.metadataJson,
        canonicalDocKey: s.canonicalDocKey,
    }));

    const banks: BankRow[] = bankLines.map((l) => ({
        id: l.id,
        accountingDate: l.accountingDate || l.valueDate,
        description: l.description || '',
        amountCents: l.amountCents,
        matchStatus: l.matchStatus,
        matchedOrderId: l.matchedOrderId,
        documentId: l.documentId,
    }));

    // Gateway sync rows + quadratura
    const gatewayRowsRaw = buildGatewaySyncRows({
        stripeMovements: stripeMovs.map((m) => ({
            id: m.id,
            stripeId: m.stripeId,
            sourceId: m.sourceId,
            type: m.type,
            amountCents: m.amountCents,
            feeCents: m.feeCents,
            netCents: m.netCents,
            createdAtStripe: m.createdAtStripe,
            orderId: m.orderId,
            description: m.description,
            metadataJson: m.metadataJson,
        })),
        paypalLedgerEntries: paypalLedger.map((e) => ({
            id: e.id,
            sourceKey: e.sourceKey,
            sourceId: e.sourceKey,
            accountingDate: e.accountingDate,
            totalCents: e.totalCents,
            description: e.description || '',
            counterpartyName: e.counterpartyName,
            category: e.category,
            metadataJson: e.metadataJson,
        })),
    });

    const orderNumbers = Array.from(
        new Set(
            gatewayRowsRaw
                .map((r) => (r.orderNumber || '').trim().toUpperCase())
                .filter((n) => n.startsWith('FM-'))
        )
    );
    const orders =
        orderNumbers.length === 0
            ? []
            : await prisma.order.findMany({
                  where: { orderNumber: { in: orderNumbers } },
                  select: {
                      id: true,
                      orderNumber: true,
                      buyerFullName: true,
                      buyerEmail: true,
                  },
                  take: 5000,
              });
    const ordersByNumber = new Map(
        orders.map((o) => [
            o.orderNumber.toUpperCase(),
            {
                id: o.id,
                orderNumber: o.orderNumber,
                buyerFullName: o.buyerFullName,
                buyerEmail: o.buyerEmail,
            },
        ])
    );
    const gatewayRows: GatewaySyncRow[] = enrichGatewayRowsWithOrders(
        gatewayRowsRaw,
        ordersByNumber
    );

    const bankForMatch = banks.map((b) => ({
        id: b.id,
        accountingDate: b.accountingDate ? dayKey(b.accountingDate) : null,
        description: b.description,
        amountCents: b.amountCents,
    }));

    const quadratura = computeGatewayQuadratura({
        fromIso: dayKey(bounds.start),
        rows: gatewayRows,
        bankLines: bankForMatch,
        stripeWalletCents: null,
        paypalWalletCents: null,
    });

    // ——— 1) Riconciliazione netti gateway su movimenti Fineco senza 1:1 ———
    const gatewayBankMovements = banks.filter((b) =>
        isGatewayRelatedFinecoMovement(b.description, b.amountCents)
    );

    const stripePayoutMatch = matchGatewayPayoutsToFineco({
        gateway: 'stripe',
        payoutRows: gatewayRows,
        bankLines: bankForMatch,
    });
    const paypalPayoutMatch = matchGatewayPayoutsToFineco({
        gateway: 'paypal',
        payoutRows: gatewayRows,
        bankLines: bankForMatch,
    });

    const matchedBankIds = new Set<string>();
    for (const m of [...stripePayoutMatch.matches, ...paypalPayoutMatch.matches]) {
        if (m.matched && m.bankLineId) matchedBankIds.add(m.bankLineId);
    }

    // SDD 1:1: addebito Fineco ↔ outflow gateway stesso importo ±7gg
    type SddMatch = {
        bankId: string;
        gateway: 'stripe' | 'paypal';
        gatewayRowId: string;
        bankCents: number;
        gatewayCents: number;
        bankDate: string;
        gatewayDate: string;
        kind: string;
    };
    const sddMatches: SddMatch[] = [];
    const sddMatchedBankIds = new Set<string>();

    const gatewayOutflows = gatewayRows.filter(
        (r) =>
            (r.movementKind === 'spesa' ||
                r.movementKind === 'commissione' ||
                r.movementKind === 'altro' ||
                (r.netCents || 0) < 0) &&
            (r.netCents || r.grossCents || 0) !== 0
    );

    for (const b of gatewayBankMovements) {
        if (b.amountCents >= 0) continue; // solo addebiti SDD
        const gw = classifyGatewayBank(b.description, b.amountCents);
        if (!gw || !b.accountingDate) continue;
        const absBank = Math.abs(b.amountCents);
        const candidates = gatewayOutflows
            .filter((r) => r.gateway === gw)
            .filter((r) => Math.abs(Math.abs(r.netCents || r.grossCents || 0) - absBank) <= 1)
            .filter((r) => withinDays(b.accountingDate!, new Date(r.occurredAt), 7));
        if (candidates.length === 1) {
            const c = candidates[0];
            sddMatches.push({
                bankId: b.id,
                gateway: gw,
                gatewayRowId: c.id,
                bankCents: b.amountCents,
                gatewayCents: c.netCents || c.grossCents || 0,
                bankDate: dayKey(b.accountingDate),
                gatewayDate: String(c.occurredAt).slice(0, 10),
                kind: c.movementKind || 'outflow',
            });
            sddMatchedBankIds.add(b.id);
            matchedBankIds.add(b.id);
        }
    }

    type ReconciledRow = {
        bankId: string;
        date: string;
        description: string;
        amountEuro: number;
        gateway: 'stripe' | 'paypal' | null;
        matchType: 'payout_1to1' | 'sdd_1to1' | 'status_matched' | 'algebraic_net';
    };
    type UncertainRow = {
        bankId: string;
        date: string;
        description: string;
        amountEuro: number;
        gateway: 'stripe' | 'paypal' | null;
        windowFrom: string;
        windowTo: string;
        sumIncassiEuro: number;
        sumSpeseEuro: number;
        sumCommissioniEuro: number;
        algebraicNetEuro: number;
        residualVsBankEuro: number;
        note: string;
    };

    const reconciled: ReconciledRow[] = [];
    const uncertain: UncertainRow[] = [];
    const TOLERANCE_CENTS = 2; // €0.02

    for (const b of gatewayBankMovements) {
        const date = b.accountingDate ? dayKey(b.accountingDate) : '';
        const gw = classifyGatewayBank(b.description, b.amountCents);
        if (matchedBankIds.has(b.id) || sddMatchedBankIds.has(b.id)) {
            reconciled.push({
                bankId: b.id,
                date,
                description: b.description.slice(0, 120),
                amountEuro: +euro(b.amountCents),
                gateway: gw,
                matchType: sddMatchedBankIds.has(b.id)
                    ? 'sdd_1to1'
                    : b.matchStatus === 'MATCHED'
                      ? 'status_matched'
                      : 'payout_1to1',
            });
            continue;
        }
        if (b.matchStatus === 'MATCHED' && b.matchedOrderId) {
            reconciled.push({
                bankId: b.id,
                date,
                description: b.description.slice(0, 120),
                amountEuro: +euro(b.amountCents),
                gateway: gw,
                matchType: 'status_matched',
            });
            continue;
        }

        // Nessun 1:1 → somma algebrica nella finestra sul canale
        // Formula: Σ Ordini Incassati − Spese/SaaS/Fornitori − Commissioni Gateway
        if (!b.accountingDate || !gw) {
            uncertain.push({
                bankId: b.id,
                date,
                description: b.description.slice(0, 120),
                amountEuro: +euro(b.amountCents),
                gateway: gw,
                windowFrom: date,
                windowTo: date,
                sumIncassiEuro: 0,
                sumSpeseEuro: 0,
                sumCommissioniEuro: 0,
                algebraicNetEuro: 0,
                residualVsBankEuro: +euro(b.amountCents),
                note: 'Non classificato come Stripe/PayPal o data assente',
            });
            continue;
        }

        const winStart = new Date(b.accountingDate.getTime() - 7 * 86400000);
        const winEnd = new Date(b.accountingDate.getTime() + 2 * 86400000);
        const inWin = gatewayRows.filter(
            (r) =>
                r.gateway === gw &&
                withinDays(new Date(r.occurredAt), b.accountingDate!, 7) &&
                new Date(r.occurredAt) >= winStart &&
                new Date(r.occurredAt) <= winEnd
        );

        let sumIncassi = 0;
        let sumSpese = 0;
        let sumComm = 0;
        for (const r of inWin) {
            if (r.movementKind === 'incasso' && (r.grossCents || 0) > 0) {
                sumIncassi += r.grossCents;
                sumComm += Math.abs(r.feeCents || 0);
            } else if (r.movementKind === 'commissione') {
                sumComm += Math.abs(r.feeCents || r.grossCents || r.netCents || 0);
            } else if (
                r.movementKind === 'spesa' ||
                ((r.netCents || 0) < 0 &&
                    r.movementKind !== 'payout' &&
                    r.movementKind !== 'rimborso' &&
                    r.movementKind !== 'incasso')
            ) {
                sumSpese += Math.abs(r.netCents || r.grossCents || 0);
            }
        }
        const algebraic = sumIncassi - sumSpese - sumComm;
        // Accredito: confronto banca vs netto algebrico; SDD: vs −(spese+fee)
        const expectedCents = b.amountCents > 0 ? algebraic : -(sumSpese + sumComm);
        const residual = b.amountCents - expectedCents;

        if (Math.abs(residual) <= TOLERANCE_CENTS && (sumIncassi > 0 || sumSpese > 0 || sumComm > 0)) {
            reconciled.push({
                bankId: b.id,
                date,
                description: b.description.slice(0, 120),
                amountEuro: +euro(b.amountCents),
                gateway: gw,
                matchType: 'algebraic_net',
            });
            continue;
        }

        uncertain.push({
            bankId: b.id,
            date,
            description: b.description.slice(0, 120),
            amountEuro: +euro(b.amountCents),
            gateway: gw,
            windowFrom: dayKey(winStart),
            windowTo: dayKey(winEnd),
            sumIncassiEuro: +euro(sumIncassi),
            sumSpeseEuro: +euro(sumSpese),
            sumCommissioniEuro: +euro(sumComm),
            algebraicNetEuro: +euro(algebraic),
            residualVsBankEuro: +euro(residual),
            note:
                b.amountCents > 0
                    ? `Accredito senza 1:1 · Σincassi−spese−fee=${euro(algebraic)} · residual=${euro(residual)}`
                    : `SDD senza outflow 1:1 · Σspese+fee=${euro(sumSpese + sumComm)} · residual=${euro(residual)}`,
        });
    }

    // ——— 2) Doppioni manuale ↔ SaaS / stesso fornitore+importo / stessa identity ———
    type DupRow = {
        keepId: string;
        removeId: string;
        reason: string;
        vendor: string;
        amountEuro: number;
        dateKeep: string;
        dateRemove: string;
        channelKeep: string;
        channelRemove: string;
    };
    const duplicatesToRemove: DupRow[] = [];

    // Manual vs SaaS by amount+vendor+±3gg
    const normVendor = (s: string) =>
        s
            .toLowerCase()
            .normalize('NFD')
            .replace(/\p{M}/gu, '')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();

    for (const m of manualExpenses) {
        const mv = normVendor(m.vendorName || '');
        if (!mv || m.totalCents === 0) continue;
        for (const s of saasInvoicesNorm) {
            const sv = normVendor(s.vendorName || '');
            if (!sv) continue;
            if (Math.abs(m.totalCents - Math.abs(s.totalCents)) > 1) continue;
            const overlap =
                mv.includes(sv) ||
                sv.includes(mv) ||
                mv.split(' ')[0] === sv.split(' ')[0];
            if (!overlap) continue;
            const md = m.expenseDate;
            const sd = s.invoiceDate || new Date(0);
            if (!withinDays(md, sd, 14)) continue;
            // Preferisci tenere SaaS certificato, rimuovere duplicato manuale
            duplicatesToRemove.push({
                keepId: s.id,
                removeId: m.id,
                reason: 'Stesso fornitore+importo manuale ↔ SaaS (±14gg)',
                vendor: m.vendorName,
                amountEuro: +euro(m.totalCents),
                dateKeep: dayKey(sd),
                dateRemove: dayKey(md),
                channelKeep: 'saas_foreign',
                channelRemove: `manual:${m.docType}`,
            });
        }
    }

    // Manual duplicates by canonical / passive identity
    const byIdentity = new Map<string, typeof manualExpenses>();
    for (const m of manualExpenses) {
        const meta = (m.metadataJson || {}) as Record<string, unknown>;
        const vat =
            (typeof meta.vendorVat === 'string' && meta.vendorVat) ||
            (typeof meta.cedenteVat === 'string' && meta.cedenteVat) ||
            null;
        const num =
            (typeof meta.invoiceNumber === 'string' && meta.invoiceNumber) ||
            (typeof meta.documentNumber === 'string' && meta.documentNumber) ||
            null;
        const identity =
            m.canonicalDocKey ||
            (typeof meta.passiveIdentityKey === 'string' && meta.passiveIdentityKey) ||
            buildPassiveIdentityKey(vat, num) ||
            buildCanonicalDocumentKey({
                supplierVat: normalizeCanonicalVat(vat),
                recipientVat: null,
                docNumber: num,
                docType: m.docType,
                docDate: dayKey(m.expenseDate),
            });
        if (!identity) continue;
        const list = byIdentity.get(identity) || [];
        list.push(m);
        byIdentity.set(identity, list);
    }
    for (const [key, list] of byIdentity) {
        if (list.length < 2) continue;
        const sorted = [...list].sort(
            (a, b) => a.expenseDate.getTime() - b.expenseDate.getTime()
        );
        const keep = sorted[0];
        for (const rem of sorted.slice(1)) {
            duplicatesToRemove.push({
                keepId: keep.id,
                removeId: rem.id,
                reason: `Identity duplicata ${key.slice(0, 80)}`,
                vendor: rem.vendorName,
                amountEuro: +euro(rem.totalCents),
                dateKeep: dayKey(keep.expenseDate),
                dateRemove: dayKey(rem.expenseDate),
                channelKeep: `manual:${keep.docType}/${keep.storageKind}`,
                channelRemove: `manual:${rem.docType}/${rem.storageKind}`,
            });
        }
    }

    // Same vendor+amount+date among manual (no identity)
    const byVendAmt = new Map<string, typeof manualExpenses>();
    for (const m of manualExpenses) {
        const k = `${normVendor(m.vendorName)}|${m.totalCents}|${dayKey(m.expenseDate)}`;
        const list = byVendAmt.get(k) || [];
        list.push(m);
        byVendAmt.set(k, list);
    }
    for (const [, list] of byVendAmt) {
        if (list.length < 2) continue;
        const sorted = [...list].sort((a, b) => a.id.localeCompare(b.id));
        const keep = sorted[0];
        for (const rem of sorted.slice(1)) {
            if (duplicatesToRemove.some((d) => d.removeId === rem.id)) continue;
            duplicatesToRemove.push({
                keepId: keep.id,
                removeId: rem.id,
                reason: 'Stesso fornitore+importo+data (manuale)',
                vendor: rem.vendorName,
                amountEuro: +euro(rem.totalCents),
                dateKeep: dayKey(keep.expenseDate),
                dateRemove: dayKey(rem.expenseDate),
                channelKeep: keep.docType,
                channelRemove: rem.docType,
            });
        }
    }

    // ——— Report ———
    const report = {
        generatedAt,
        period: {
            year: args.year,
            quarter: args.quarter,
            label: bounds.label,
            start: bounds.start.toISOString(),
            end: bounds.end.toISOString(),
        },
        counts: {
            bankLines: banks.length,
            gatewayRelatedBank: gatewayBankMovements.length,
            stripeMovements: stripeMovs.length,
            paypalLedger: paypalLedger.length,
            gatewaySyncRows: gatewayRows.length,
            manualExpenses: manualExpenses.length,
            saasInvoices: saasInvoicesNorm.length,
        },
        c1c3: {
            C1: {
                passed: c1.passed,
                detail: c1.detail,
                measured: c1.measured,
                unit: c1.unit,
            },
            C2: {
                passed: c2.passed,
                detail: c2.detail,
                measured: c2.measured,
                deltaEuro: Number.isFinite(c2.delta) ? +euro(c2.delta) : null,
            },
            C3: {
                passed: c3.passed,
                verifiable: c3.verifiable !== false,
                detail: c3.detail,
                measured: c3.measured,
                deltaEuro:
                    c3.verifiable !== false && Number.isFinite(c3.delta) ? +euro(c3.delta) : null,
            },
        },
        gatewayQuadratura: {
            stripe: {
                isQuadrato: quadratura.stripe.isQuadrato,
                entrateLordoEuro: +euro(quadratura.stripe.entrateLordoCents),
                commissioniEuro: +euro(quadratura.stripe.commissioniCents),
                speseEuro: +euro(quadratura.stripe.speseCents),
                payoutEuro: +euro(quadratura.stripe.payoutCents),
                residuoStripeEuro:
                    quadratura.stripe.residuoStripeCents != null
                        ? +euro(quadratura.stripe.residuoStripeCents)
                        : null,
            },
            paypal: {
                isQuadrato: quadratura.paypal.isQuadrato,
                entrateLordoEuro: +euro(quadratura.paypal.entrateLordoCents),
                commissioniEuro: +euro(quadratura.paypal.commissioniCents),
                speseEuro: +euro(quadratura.paypal.speseCents),
                payoutEuro: +euro(quadratura.paypal.payoutCents),
            },
        },
        payoutMatch: {
            stripe: {
                matchCount: stripePayoutMatch.matchCount,
                unmatchedPayoutCount: stripePayoutMatch.unmatchedPayoutCount,
                unmatchedBankCount: stripePayoutMatch.unmatchedBankCount,
            },
            paypal: {
                matchCount: paypalPayoutMatch.matchCount,
                unmatchedPayoutCount: paypalPayoutMatch.unmatchedPayoutCount,
                unmatchedBankCount: paypalPayoutMatch.unmatchedBankCount,
            },
            sddOneToOne: sddMatches.length,
        },
        tables: {
            reconciledCorrectly: reconciled,
            uncertainOrResidual: uncertain,
            duplicatesToRemove: duplicatesToRemove,
        },
    };

    const stamp = new Date().toISOString().slice(0, 10);
    const base = path.join(
        process.cwd(),
        'docs',
        'verbali',
        `${stamp}-audit-riconciliazione-T${args.quarter}`
    );
    fs.writeFileSync(`${base}.json`, JSON.stringify(report, null, 2) + '\n');

    const md = [
        `# Audit riconciliazione ${bounds.label}`,
        '',
        `Generato: ${generatedAt}`,
        '',
        '## C1–C3',
        '',
        `| Controllo | Esito | Dettaglio |`,
        `|---|---|---|`,
        `| C1 Completezza banca | ${c1.passed ? 'PASS' : 'FAIL'} | ${c1.detail} |`,
        `| C2 Quadratura banca | ${c2.passed ? 'PASS' : 'FAIL'} | ${c2.detail} |`,
        `| C3 Continuità saldo | ${c3.verifiable === false ? 'N/V' : c3.passed ? 'PASS' : 'FAIL'} | ${c3.detail} |`,
        '',
        '## Movimenti bancari riconciliati correttamente',
        '',
        `| Data | Gateway | € | Tipo match | Causale |`,
        `|---|---|---:|---|---|`,
        ...reconciled.map(
            (r) =>
                `| ${r.date} | ${r.gateway || '—'} | ${r.amountEuro.toFixed(2)} | ${r.matchType} | ${r.description.replace(/\|/g, '/')} |`
        ),
        '',
        `**Totale:** ${reconciled.length}`,
        '',
        '## Movimenti con associazione incerta o scostamento',
        '',
        `| Data | Gateway | Banca € | Σ Incassi | Σ Spese | Σ Fee | Netto alg. | Residuo | Nota |`,
        `|---|---|---:|---:|---:|---:|---:|---:|---|`,
        ...uncertain.map(
            (r) =>
                `| ${r.date} | ${r.gateway || '—'} | ${r.amountEuro.toFixed(2)} | ${r.sumIncassiEuro.toFixed(2)} | ${r.sumSpeseEuro.toFixed(2)} | ${r.sumCommissioniEuro.toFixed(2)} | ${r.algebraicNetEuro.toFixed(2)} | ${r.residualVsBankEuro.toFixed(2)} | ${r.note.replace(/\|/g, '/')} |`
        ),
        '',
        `**Totale:** ${uncertain.length}`,
        '',
        '## Righe duplicate da rimuovere',
        '',
        `| Vendor | € | Keep | Remove | Canali | Motivo |`,
        `|---|---:|---|---|---|---|`,
        ...duplicatesToRemove.map(
            (d) =>
                `| ${d.vendor.replace(/\|/g, '/')} | ${d.amountEuro.toFixed(2)} | ${d.keepId.slice(0, 10)}… ${d.dateKeep} | ${d.removeId.slice(0, 10)}… ${d.dateRemove} | ${d.channelKeep} ↔ ${d.channelRemove} | ${d.reason.replace(/\|/g, '/')} |`
        ),
        '',
        `**Totale da rimuovere:** ${duplicatesToRemove.length}`,
        '',
        `JSON: \`${path.basename(base)}.json\``,
        '',
    ].join('\n');
    fs.writeFileSync(`${base}.md`, md);

    console.info('[audit-reconcile] OK', {
        reconciled: reconciled.length,
        uncertain: uncertain.length,
        duplicates: duplicatesToRemove.length,
        c1: c1.passed,
        c2: c2.passed,
        c3: c3.verifiable === false ? 'N/V' : c3.passed,
        out: base,
    });
}

main()
    .catch((e) => {
        console.error('[audit-reconcile] FAIL', e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
