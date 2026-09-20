/**
 * Pipeline 2026 T1–T4: audit → rimozione doppioni → riconciliazione gateway → C1–C14 persist.
 *
 * Uso:
 *   npx tsx scripts/apply-2026-quarters-audit-clean-reconcile.ts           # dry-run
 *   npx tsx scripts/apply-2026-quarters-audit-clean-reconcile.ts --apply   # scrive su Neon
 *
 * Protegge le associazioni manuali (matchNotes «Riconciliato Manualmente»).
 */
import { loadEnvFiles } from '@/lib/loadEnvFiles';
loadEnvFiles();
if (process.env.DATABASE_URL_UNPOOLED?.trim()) {
    process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED.trim();
}

import fs from 'node:fs';
import path from 'node:path';
import prisma from '@/lib/prisma';
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
import {
    runAllDossierControls,
    runAndPersistDossierControls,
} from '@/lib/financial/dossierFiscalControls';
import { syncHistoricalLedgerFromSources } from '@/lib/financial/historicalLedgerSync';
import { summarizeControls } from '@/lib/financial/dossierControlsStore';

const APPLY = process.argv.includes('--apply');
const YEAR = 2026;
const QUARTERS: TaxQuarter[] = [1, 2, 3, 4];
const TOLERANCE_CENTS = 2;
const MANUAL_NOTE_PREFIX = 'Riconciliato Manualmente';

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

function normVendor(s: string): string {
    return s
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function classifyGatewayBank(desc: string, amountCents: number): 'stripe' | 'paypal' | null {
    if (!isGatewayRelatedFinecoMovement(desc, amountCents)) return null;
    const u = desc.toUpperCase();
    if (/\bSTRIPE\b/.test(u)) return 'stripe';
    if (/\bPAYPAL\b/.test(u)) return 'paypal';
    return null;
}

function isProtectedManual(matchNotes: string | null | undefined): boolean {
    return Boolean(matchNotes && matchNotes.startsWith(MANUAL_NOTE_PREFIX));
}

type DeletedDup = {
    id: string;
    channel: 'manual' | 'saas';
    vendor: string;
    amountEuro: number;
    date: string;
    reason: string;
    keepId: string;
};

type AppliedMatch = {
    bankId: string;
    date: string;
    gateway: 'stripe' | 'paypal';
    amountEuro: number;
    kind: 'payout_1to1' | 'sdd_1to1' | 'algebraic_net' | 'algebraic_partial';
    matchType: string;
    residualEuro: number;
    protectedManual: boolean;
    note: string;
};

async function reverseLedgerForManualExpense(expenseId: string) {
    await prisma.financialLedgerEntry.updateMany({
        where: {
            reversedAt: null,
            OR: [
                { sourceId: expenseId, sourceType: 'MANUAL_EXPENSE' },
                { sourceKey: `MANUAL_EXPENSE:${expenseId}` },
            ],
        },
        data: { reversedAt: new Date() },
    });
}

async function reverseLedgerForSaas(saasId: string) {
    await prisma.financialLedgerEntry.updateMany({
        where: {
            reversedAt: null,
            OR: [
                { sourceId: saasId, sourceType: 'SAAS_INVOICE' },
                { sourceKey: `SAAS_INVOICE:${saasId}` },
            ],
        },
        data: { reversedAt: new Date() },
    });
}

async function deleteManualExpenseSafe(id: string): Promise<boolean> {
    const row = await prisma.manualFinanceExpense.findUnique({ where: { id } });
    if (!row) return false;
    // Non scollegare la riga banca se è un'associazione manuale protetta
    if (row.matchedStatementLineId) {
        const line = await prisma.bankStatementLine.findUnique({
            where: { id: row.matchedStatementLineId },
            select: { matchNotes: true },
        });
        if (line && isProtectedManual(line.matchNotes)) {
            // Solo stacca expense; lascia MATCHED banca
            await prisma.manualFinanceExpense.update({
                where: { id },
                data: { matchedStatementLineId: null, reconciled: false },
            });
        } else if (line) {
            await prisma.manualFinanceExpense.update({
                where: { id },
                data: { matchedStatementLineId: null, reconciled: false },
            });
        }
    }
    await reverseLedgerForManualExpense(id);
    await prisma.manualFinanceExpense.delete({ where: { id } });
    return true;
}

async function findDuplicatesForQuarter(
    start: Date,
    end: Date
): Promise<DeletedDup[]> {
    const [manualExpenses, saasInvoices] = await Promise.all([
        prisma.manualFinanceExpense.findMany({
            where: {
                expenseDate: { gte: start, lte: end },
                docType: {
                    in: ['FATTURA', 'NOTA_CREDITO', 'RICEVUTA', 'SCONTRINO', 'AUTOFATTURA'],
                },
            },
            select: {
                id: true,
                vendorName: true,
                totalCents: true,
                expenseDate: true,
                docType: true,
                storageKind: true,
                metadataJson: true,
                canonicalDocKey: true,
                createdAt: true,
                matchedStatementLineId: true,
            },
            take: 10000,
        }),
        prisma.saasForeignInvoice.findMany({
            where: {
                OR: [
                    { invoiceDate: { gte: start, lte: end } },
                    { createdAt: { gte: start, lte: end } },
                ],
            },
            select: {
                id: true,
                vendorName: true,
                eurAmountCents: true,
                invoiceDate: true,
                metadataJson: true,
                canonicalDocKey: true,
                createdAt: true,
            },
            take: 5000,
        }),
    ]);

    const planned = new Map<string, DeletedDup>(); // removeId → info
    const mark = (d: DeletedDup) => {
        if (planned.has(d.id)) return;
        planned.set(d.id, d);
    };

    // 1) Manuale ↔ SaaS (stesso fornitore+importo ±14gg) → rimuovi manuale, tieni SaaS
    for (const m of manualExpenses) {
        const mv = normVendor(m.vendorName || '');
        if (!mv || m.totalCents === 0) continue;
        for (const s of saasInvoices) {
            const sv = normVendor(s.vendorName || '');
            if (!sv) continue;
            if (Math.abs(m.totalCents - Math.abs(s.eurAmountCents)) > 1) continue;
            const overlap =
                mv.includes(sv) ||
                sv.includes(mv) ||
                mv.split(' ')[0] === sv.split(' ')[0];
            if (!overlap) continue;
            if (!withinDays(m.expenseDate, s.invoiceDate, 14)) continue;
            mark({
                id: m.id,
                channel: 'manual',
                vendor: m.vendorName,
                amountEuro: +euro(m.totalCents),
                date: dayKey(m.expenseDate),
                reason: 'manuale↔saas stesso fornitore+importo',
                keepId: s.id,
            });
        }
    }

    // 2) Identity / canonical tra manuali
    const byIdentity = new Map<string, typeof manualExpenses>();
    for (const m of manualExpenses) {
        if (planned.has(m.id)) continue;
        const meta = (m.metadataJson || {}) as Record<string, unknown>;
        const vat =
            (typeof meta.vendorVat === 'string' && meta.vendorVat) ||
            (typeof meta.cedenteVat === 'string' && meta.cedenteVat) ||
            null;
        const num =
            (typeof meta.invoiceNumber === 'string' && meta.invoiceNumber) ||
            (typeof meta.documentNumber === 'string' && meta.documentNumber) ||
            null;
        // Chiavi deboli NOVAT+NONUM: solo se stesso giorno+importo (già coperto sotto)
        const identity =
            m.canonicalDocKey ||
            (typeof meta.passiveIdentityKey === 'string' && meta.passiveIdentityKey) ||
            buildPassiveIdentityKey(vat, num) ||
            (vat || num
                ? buildCanonicalDocumentKey({
                      supplierVat: normalizeCanonicalVat(vat),
                      recipientVat: null,
                      docNumber: num,
                      docType: m.docType,
                      docDate: dayKey(m.expenseDate),
                  })
                : null);
        if (!identity || (identity.includes('NOVAT') && identity.includes('NONUM'))) continue;
        const list = byIdentity.get(identity) || [];
        list.push(m);
        byIdentity.set(identity, list);
    }
    for (const [key, list] of byIdentity) {
        if (list.length < 2) continue;
        const sorted = [...list].sort(
            (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
        );
        const keep = sorted[0];
        for (const rem of sorted.slice(1)) {
            if (planned.has(rem.id)) continue;
            mark({
                id: rem.id,
                channel: 'manual',
                vendor: rem.vendorName,
                amountEuro: +euro(rem.totalCents),
                date: dayKey(rem.expenseDate),
                reason: `identity ${key.slice(0, 60)}`,
                keepId: keep.id,
            });
        }
    }

    // 3) Stesso vendor+importo+giorno (manuale) — include scontrini NOVAT
    const byVendAmt = new Map<string, typeof manualExpenses>();
    for (const m of manualExpenses) {
        if (planned.has(m.id)) continue;
        const k = `${normVendor(m.vendorName)}|${m.totalCents}|${dayKey(m.expenseDate)}`;
        const list = byVendAmt.get(k) || [];
        list.push(m);
        byVendAmt.set(k, list);
    }
    for (const [, list] of byVendAmt) {
        if (list.length < 2) continue;
        // Preferisci chi ha blob / matched / createdAt più vecchio
        const sorted = [...list].sort((a, b) => {
            const score = (x: typeof a) =>
                (x.matchedStatementLineId ? 4 : 0) +
                (x.storageKind === 'blob' ? 2 : 0) +
                (x.storageKind !== 'none' ? 1 : 0);
            const ds = score(b) - score(a);
            if (ds !== 0) return ds;
            return a.createdAt.getTime() - b.createdAt.getTime();
        });
        const keep = sorted[0];
        for (const rem of sorted.slice(1)) {
            if (planned.has(rem.id)) continue;
            mark({
                id: rem.id,
                channel: 'manual',
                vendor: rem.vendorName,
                amountEuro: +euro(rem.totalCents),
                date: dayKey(rem.expenseDate),
                reason: 'stesso fornitore+importo+data',
                keepId: keep.id,
            });
        }
    }

    // 4) SaaS duplicati stesso vendor+data+importo
    const bySaas = new Map<string, typeof saasInvoices>();
    for (const s of saasInvoices) {
        const k = `${normVendor(s.vendorName)}|${dayKey(s.invoiceDate)}|${s.eurAmountCents}`;
        const list = bySaas.get(k) || [];
        list.push(s);
        bySaas.set(k, list);
    }
    for (const [, list] of bySaas) {
        if (list.length < 2) continue;
        const sorted = [...list].sort(
            (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
        );
        const keep = sorted[0];
        for (const rem of sorted.slice(1)) {
            mark({
                id: rem.id,
                channel: 'saas',
                vendor: rem.vendorName,
                amountEuro: +euro(rem.eurAmountCents),
                date: dayKey(rem.invoiceDate),
                reason: 'saas duplicato vendor+data+importo',
                keepId: keep.id,
            });
        }
    }

    return Array.from(planned.values());
}

async function applyDeletes(dups: DeletedDup[]): Promise<DeletedDup[]> {
    const done: DeletedDup[] = [];
    for (const d of dups) {
        if (!APPLY) {
            done.push(d);
            continue;
        }
        try {
            if (d.channel === 'manual') {
                const ok = await deleteManualExpenseSafe(d.id);
                if (ok) done.push(d);
            } else {
                await reverseLedgerForSaas(d.id);
                await prisma.saasForeignInvoice.delete({ where: { id: d.id } });
                done.push(d);
            }
        } catch (err) {
            console.error('[apply-2026] delete FAIL', d.id, err);
        }
    }
    return done;
}

async function loadGatewayContext(start: Date, end: Date) {
    const [bankLines, stripeMovs, paypalLedger] = await Promise.all([
        prisma.bankStatementLine.findMany({
            where: {
                OR: [
                    { accountingDate: { gte: start, lte: end } },
                    { valueDate: { gte: start, lte: end } },
                ],
            },
            select: {
                id: true,
                documentId: true,
                accountingDate: true,
                valueDate: true,
                description: true,
                amountCents: true,
                matchStatus: true,
                matchType: true,
                matchNotes: true,
                matchedTxId: true,
                matchedOrderId: true,
                rawJson: true,
            },
            orderBy: [{ accountingDate: 'asc' }],
            take: 10000,
        }),
        prisma.stripeFinanceMovement.findMany({
            where: { createdAtStripe: { gte: start, lte: end } },
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
                metadataJson: true,
            },
            take: 20000,
        }),
        prisma.financialLedgerEntry.findMany({
            where: {
                reversedAt: null,
                sourceKey: { startsWith: 'PAYPAL_' },
                accountingDate: { gte: start, lte: end },
            },
            select: {
                id: true,
                sourceKey: true,
                accountingDate: true,
                totalCents: true,
                description: true,
                counterpartyName: true,
                category: true,
                metadataJson: true,
            },
            take: 20000,
        }),
    ]);

    const rawRows = buildGatewaySyncRows({
        stripeMovements: stripeMovs,
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
            rawRows
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
    const gatewayRows = enrichGatewayRowsWithOrders(rawRows, ordersByNumber);

    return { bankLines, gatewayRows };
}

function algebraicBreakdown(
    gatewayRows: GatewaySyncRow[],
    gateway: 'stripe' | 'paypal',
    bankDate: Date
) {
    const winStart = new Date(bankDate.getTime() - 7 * 86400000);
    const winEnd = new Date(bankDate.getTime() + 2 * 86400000);
    const inWin = gatewayRows.filter(
        (r) =>
            r.gateway === gateway &&
            withinDays(new Date(r.occurredAt), bankDate, 7) &&
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
            (r.netCents || 0) < 0 &&
            r.movementKind !== 'payout' &&
            r.movementKind !== 'rimborso' &&
            r.movementKind !== 'incasso'
        ) {
            sumSpese += Math.abs(r.netCents || r.grossCents || 0);
        }
    }
    return {
        sumIncassi,
        sumSpese,
        sumComm,
        algebraic: sumIncassi - sumSpese - sumComm,
        windowFrom: dayKey(winStart),
        windowTo: dayKey(winEnd),
        componentCount: inWin.length,
    };
}

async function refreshDocumentCounts(documentIds: Set<string>) {
    for (const documentId of documentIds) {
        const [matchedCount, unmatchedCount] = await Promise.all([
            prisma.bankStatementLine.count({
                where: { documentId, matchStatus: 'MATCHED' },
            }),
            prisma.bankStatementLine.count({
                where: { documentId, matchStatus: { not: 'MATCHED' } },
            }),
        ]);
        await prisma.bankStatementDocument.update({
            where: { id: documentId },
            data: { matchedCount, unmatchedCount },
        });
    }
}

async function applyGatewayReconciliations(
    bankLines: Awaited<ReturnType<typeof loadGatewayContext>>['bankLines'],
    gatewayRows: GatewaySyncRow[]
): Promise<{ applied: AppliedMatch[]; preservedManual: number }> {
    const bankForMatch = bankLines.map((b) => ({
        id: b.id,
        accountingDate: b.accountingDate ? dayKey(b.accountingDate) : b.valueDate ? dayKey(b.valueDate) : null,
        description: b.description || '',
        amountCents: b.amountCents,
    }));

    const stripePayout = matchGatewayPayoutsToFineco({
        gateway: 'stripe',
        payoutRows: gatewayRows,
        bankLines: bankForMatch,
    });
    const paypalPayout = matchGatewayPayoutsToFineco({
        gateway: 'paypal',
        payoutRows: gatewayRows,
        bankLines: bankForMatch,
    });

    const payoutByBank = new Map<
        string,
        { gateway: 'stripe' | 'paypal'; txId: string; payoutCents: number }
    >();
    for (const m of [...stripePayout.matches, ...paypalPayout.matches]) {
        if (m.matched && m.bankLineId) {
            payoutByBank.set(m.bankLineId, {
                gateway: m.gateway,
                txId: m.transactionId,
                payoutCents: m.payoutAmountCents,
            });
        }
    }

    // SDD 1:1
    const sddByBank = new Map<
        string,
        { gateway: 'stripe' | 'paypal'; rowId: string; cents: number }
    >();
    const gatewayOutflows = gatewayRows.filter(
        (r) =>
            (r.netCents || 0) < 0 &&
            r.movementKind !== 'payout' &&
            r.movementKind !== 'rimborso'
    );
    const gatewayBank = bankLines.filter((b) =>
        isGatewayRelatedFinecoMovement(b.description || '', b.amountCents)
    );
    for (const b of gatewayBank) {
        if (b.amountCents >= 0) continue;
        const gw = classifyGatewayBank(b.description || '', b.amountCents);
        const bankDate = b.accountingDate || b.valueDate;
        if (!gw || !bankDate) continue;
        const absBank = Math.abs(b.amountCents);
        const candidates = gatewayOutflows
            .filter((r) => r.gateway === gw)
            .filter((r) => Math.abs(Math.abs(r.netCents || r.grossCents || 0) - absBank) <= 1)
            .filter((r) => withinDays(bankDate, new Date(r.occurredAt), 7));
        if (candidates.length === 1) {
            sddByBank.set(b.id, {
                gateway: gw,
                rowId: candidates[0].id,
                cents: candidates[0].netCents || candidates[0].grossCents || 0,
            });
        }
    }

    const applied: AppliedMatch[] = [];
    let preservedManual = 0;
    const touchedDocs = new Set<string>();

    for (const b of gatewayBank) {
        const bankDate = b.accountingDate || b.valueDate;
        const date = bankDate ? dayKey(bankDate) : '';
        const gw = classifyGatewayBank(b.description || '', b.amountCents);
        if (!gw || !bankDate) continue;

        const protectedManual = isProtectedManual(b.matchNotes);
        if (protectedManual) preservedManual += 1;

        const payout = payoutByBank.get(b.id);
        const sdd = sddByBank.get(b.id);

        let kind: AppliedMatch['kind'];
        let matchType: string;
        let matchedTxId: string | null = b.matchedTxId;
        let residual = 0;
        let note: string;
        let breakdown: ReturnType<typeof algebraicBreakdown> | null = null;

        if (payout) {
            kind = 'payout_1to1';
            matchType = gw === 'stripe' ? 'STRIPE_PAYOUT' : 'PAYPAL_PAYOUT';
            matchedTxId = payout.txId;
            residual = 0;
            note = `pipeline payout_1to1 ${gw} ${payout.txId}`;
        } else if (sdd) {
            kind = 'sdd_1to1';
            matchType = 'SAAS_SUBSCRIPTION';
            matchedTxId = sdd.rowId.slice(0, 128);
            residual = 0;
            note = `pipeline sdd_1to1 ${gw} ${sdd.rowId}`;
        } else {
            breakdown = algebraicBreakdown(gatewayRows, gw, bankDate);
            const expected =
                b.amountCents > 0
                    ? breakdown.algebraic
                    : -(breakdown.sumSpese + breakdown.sumComm);
            residual = b.amountCents - expected;
            const exact = Math.abs(residual) <= TOLERANCE_CENTS;
            kind = exact ? 'algebraic_net' : 'algebraic_partial';
            matchType =
                b.amountCents > 0
                    ? gw === 'stripe'
                        ? 'STRIPE_PAYOUT'
                        : 'PAYPAL_PAYOUT'
                    : 'SAAS_SUBSCRIPTION';
            note = `pipeline ${kind} Σinc=${euro(breakdown.sumIncassi)}−spese=${euro(breakdown.sumSpese)}−fee=${euro(breakdown.sumComm)} residuo=${euro(residual)}`;
        }

        const prevRaw =
            b.rawJson && typeof b.rawJson === 'object' && !Array.isArray(b.rawJson)
                ? (b.rawJson as Record<string, unknown>)
                : {};

        const gatewayReconcile = {
            appliedAt: new Date().toISOString(),
            kind,
            gateway: gw,
            residualCents: residual,
            matchType,
            matchedTxId,
            breakdown: breakdown
                ? {
                      sumIncassiCents: breakdown.sumIncassi,
                      sumSpeseCents: breakdown.sumSpese,
                      sumCommissioniCents: breakdown.sumComm,
                      algebraicNetCents: breakdown.algebraic,
                      windowFrom: breakdown.windowFrom,
                      windowTo: breakdown.windowTo,
                      componentCount: breakdown.componentCount,
                  }
                : null,
            protectedManual,
        };

        // Non sovrascrivere matchType/notes se associazione manuale protetta
        const data: Record<string, unknown> = {
            rawJson: { ...prevRaw, gatewayReconcile },
        };
        if (!protectedManual) {
            data.matchStatus = kind === 'algebraic_partial' ? 'PARTIAL' : 'MATCHED';
            data.matchType = matchType;
            data.matchedTxId = matchedTxId;
            data.matchScore = kind === 'algebraic_partial' ? 70 : 100;
            // Conserva note esistenti non-pipeline; appendi sintesi
            const baseNotes = (b.matchNotes || '').startsWith('pipeline ')
                ? ''
                : b.matchNotes || '';
            data.matchNotes = baseNotes
                ? `${baseNotes} · ${note}`.slice(0, 2000)
                : note.slice(0, 2000);
        }

        if (APPLY) {
            await prisma.bankStatementLine.update({
                where: { id: b.id },
                data,
            });
            touchedDocs.add(b.documentId);
        }

        applied.push({
            bankId: b.id,
            date,
            gateway: gw,
            amountEuro: +euro(b.amountCents),
            kind,
            matchType,
            residualEuro: +euro(residual),
            protectedManual,
            note,
        });
    }

    if (APPLY && touchedDocs.size > 0) {
        await refreshDocumentCounts(touchedDocs);
    }

    return { applied, preservedManual };
}

type QuarterReport = {
    quarter: TaxQuarter;
    label: string;
    duplicatesDeleted: number;
    deletedIds: DeletedDup[];
    reconciliationsApplied: number;
    byKind: Record<string, number>;
    preservedManualAssociations: number;
    residualExactEuro: number | null;
    controls: {
        passed: number;
        failed: number;
        notVerifiable: number;
        total: number;
        c1?: { passed: boolean; detail: string; delta: number };
        c2?: { passed: boolean; detail: string; deltaEuro: number };
        c3?: { passed: boolean; verifiable: boolean; detail: string };
        c4?: { passed: boolean; detail: string; deltaEuro: number };
        c13?: { passed: boolean; detail: string; deltaEuro: number };
        all: Array<{ id: string; passed: boolean; verifiable?: boolean; detail: string; delta: number }>;
    };
};

async function processQuarter(quarter: TaxQuarter): Promise<QuarterReport> {
    const bounds = resolveQuarterBounds(YEAR, quarter);
    console.info(`\n═══ ${bounds.label} ${APPLY ? 'APPLY' : 'DRY-RUN'} ═══`);

    // 1) Doppioni
    const planned = await findDuplicatesForQuarter(bounds.start, bounds.end);
    console.info(`[${bounds.label}] doppioni pianificati:`, planned.length);
    const deleted = await applyDeletes(planned);
    console.info(`[${bounds.label}] doppioni ${APPLY ? 'eliminati' : 'simulati'}:`, deleted.length);

    // 2) Riconciliazione gateway
    const { bankLines, gatewayRows } = await loadGatewayContext(bounds.start, bounds.end);
    const { applied, preservedManual } = await applyGatewayReconciliations(
        bankLines,
        gatewayRows
    );
    const byKind: Record<string, number> = {};
    for (const a of applied) {
        byKind[a.kind] = (byKind[a.kind] || 0) + 1;
    }
    console.info(`[${bounds.label}] riconciliazioni:`, applied.length, byKind, {
        preservedManual,
    });

    // Residuo esatto = somma abs residuali algebraic_partial + algebraic_net scostanti
    const residualExactCents = applied
        .filter((a) => a.kind === 'algebraic_partial' || Math.abs(a.residualEuro) > 0.02)
        .reduce((s, a) => s + Math.round(a.residualEuro * 100), 0);

    // 3) Sync ledger + controlli (solo in apply, o sempre i controlli in lettura)
    if (APPLY && (deleted.length > 0 || applied.length > 0)) {
        console.info(`[${bounds.label}] syncHistoricalLedgerFromSources…`);
        await syncHistoricalLedgerFromSources();
    }

    console.info(`[${bounds.label}] dossier controls C1–C14…`);
    const controls = APPLY
        ? await runAndPersistDossierControls(YEAR, quarter, {
              allowIncompleteVat: true,
          })
        : await runAllDossierControls(YEAR, quarter, {
              allowIncompleteVat: true,
          });

    const summary = summarizeControls(controls);
    const pick = (id: string) => controls.find((c) => c.id === id);

    const c1 = pick('C1');
    const c2 = pick('C2');
    const c3 = pick('C3');
    const c4 = pick('C4');
    const c13 = pick('C13');

    return {
        quarter,
        label: bounds.label,
        duplicatesDeleted: deleted.length,
        deletedIds: deleted,
        reconciliationsApplied: applied.length,
        byKind,
        preservedManualAssociations: preservedManual,
        residualExactEuro:
            bankLines.length === 0 ? null : +euro(residualExactCents),
        controls: {
            passed: summary.passed,
            failed: summary.failedCount,
            notVerifiable: summary.notVerifiableCount,
            total: summary.total,
            c1: c1
                ? { passed: c1.passed, detail: c1.detail, delta: c1.delta }
                : undefined,
            c2: c2
                ? {
                      passed: c2.passed,
                      detail: c2.detail,
                      deltaEuro: +euro(c2.delta),
                  }
                : undefined,
            c3: c3
                ? {
                      passed: c3.passed,
                      verifiable: c3.verifiable !== false,
                      detail: c3.detail,
                  }
                : undefined,
            c4: c4
                ? {
                      passed: c4.passed,
                      detail: c4.detail,
                      deltaEuro: +euro(c4.delta),
                  }
                : undefined,
            c13: c13
                ? {
                      passed: c13.passed,
                      detail: c13.detail,
                      deltaEuro: +euro(c13.delta),
                  }
                : undefined,
            all: controls.map((c) => ({
                id: c.id,
                passed: c.passed,
                verifiable: c.verifiable,
                detail: c.detail,
                delta: c.delta,
            })),
        },
    };
}

async function main() {
    console.info('[apply-2026] mode', APPLY ? 'APPLY (scrittura DB)' : 'DRY-RUN');
    const reports: QuarterReport[] = [];

    // In dry-run: usa runAll senza persist — fix the processQuarter logic
    for (const q of QUARTERS) {
        reports.push(await processQuarter(q));
    }

    const stamp = new Date().toISOString().slice(0, 10);
    const base = path.join(
        process.cwd(),
        'docs',
        'verbali',
        `${stamp}-pipeline-2026-T1-T4${APPLY ? '-apply' : '-dryrun'}`
    );

    const payload = {
        generatedAt: new Date().toISOString(),
        mode: APPLY ? 'apply' : 'dry-run',
        year: YEAR,
        quarters: reports,
        totals: {
            duplicatesDeleted: reports.reduce((s, r) => s + r.duplicatesDeleted, 0),
            reconciliationsApplied: reports.reduce(
                (s, r) => s + r.reconciliationsApplied,
                0
            ),
            controlsPassed: reports.reduce((s, r) => s + r.controls.passed, 0),
            controlsFailed: reports.reduce((s, r) => s + r.controls.failed, 0),
        },
    };
    fs.writeFileSync(`${base}.json`, JSON.stringify(payload, null, 2) + '\n');

    const mdLines = [
        `# Pipeline audit/pulizia/riconciliazione 2026 (T1–T4)`,
        '',
        `Mode: **${APPLY ? 'APPLY' : 'DRY-RUN'}** · Generato: ${payload.generatedAt}`,
        '',
        '| Trimestre | Doppioni eliminati | Riconciliazioni | C VERDI | C FAIL | C N/V | Residuo alg. € |',
        '|---|---:|---:|---:|---:|---:|---:|',
    ];
    for (const r of reports) {
        mdLines.push(
            `| ${r.label} | ${r.duplicatesDeleted} | ${r.reconciliationsApplied} | ${r.controls.passed} | ${r.controls.failed} | ${r.controls.notVerifiable} | ${r.residualExactEuro ?? '—'} |`
        );
    }
    mdLines.push('');
    for (const r of reports) {
        mdLines.push(`## ${r.label}`);
        mdLines.push('');
        mdLines.push(
            `- Doppioni: ${r.duplicatesDeleted} · Manuali protette nel trimestre gateway: ${r.preservedManualAssociations}`
        );
        mdLines.push(
            `- Match kinds: ${JSON.stringify(r.byKind)}`
        );
        mdLines.push(
            `- C1: ${r.controls.c1?.passed ? 'PASS' : 'FAIL'} — ${r.controls.c1?.detail || ''}`
        );
        mdLines.push(
            `- C2: ${r.controls.c2?.passed ? 'PASS' : 'FAIL'} — Δ€${r.controls.c2?.deltaEuro ?? '?'} — ${r.controls.c2?.detail || ''}`
        );
        mdLines.push(
            `- C3: ${r.controls.c3?.verifiable === false ? 'N/V' : r.controls.c3?.passed ? 'PASS' : 'FAIL'} — ${r.controls.c3?.detail || ''}`
        );
        mdLines.push(
            `- C4: ${r.controls.c4?.passed ? 'PASS' : 'FAIL'} — Δ€${r.controls.c4?.deltaEuro ?? '?'} — ${r.controls.c4?.detail || ''}`
        );
        mdLines.push(
            `- C13: ${r.controls.c13?.passed ? 'PASS' : 'FAIL'} — Δ€${r.controls.c13?.deltaEuro ?? '?'} — ${r.controls.c13?.detail || ''}`
        );
        mdLines.push('');
        mdLines.push('| Ctrl | Esito | Δ | Dettaglio |');
        mdLines.push('|---|---|---:|---|');
        for (const c of r.controls.all) {
            const esito =
                c.verifiable === false ? 'N/V' : c.passed ? 'PASS' : 'FAIL';
            mdLines.push(
                `| ${c.id} | ${esito} | ${Number.isFinite(c.delta) ? euro(c.delta) : '—'} | ${c.detail.replace(/\|/g, '/')} |`
            );
        }
        if (r.deletedIds.length) {
            mdLines.push('');
            mdLines.push('### ID eliminati');
            mdLines.push('');
            for (const d of r.deletedIds) {
                mdLines.push(
                    `- \`${d.id}\` (${d.channel}) ${d.vendor} €${d.amountEuro.toFixed(2)} ${d.date} — ${d.reason} · keep \`${d.keepId}\``
                );
            }
        }
        mdLines.push('');
    }
    fs.writeFileSync(`${base}.md`, mdLines.join('\n'));

    console.info('\n[apply-2026] DONE', {
        mode: APPLY ? 'apply' : 'dry-run',
        out: base,
        totals: payload.totals,
    });
}

main()
    .catch((e) => {
        console.error('[apply-2026] FAIL', e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
