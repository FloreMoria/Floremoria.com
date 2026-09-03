/**
 * Elenco pagamenti PayPal esteri per trimestre, già ridotti dalla state machine.
 */

import prisma from '@/lib/prisma';
import { applyPaypalStateMachine, paypalSignedCents } from '@/lib/accounting/paypalStateMachine';
import {
    isPaypalForeignSupplierOutflow,
    paypalForeignTxnRef,
    suggestPaypalForeignNature,
    vendorsLikelyMatch,
    type PaypalForeignDocStatus,
    type PaypalForeignDocType,
    type PaypalForeignJurisdiction,
} from '@/lib/accounting/paypalForeignSuppliers';
import {
    periodBounds,
    type PrimaNotaPeriodKey,
} from '@/lib/financial/primaNotaShared';
import { normalizePrimaNotaPeriodKey } from '@/lib/financial/trimestreLabel';

export type PaypalForeignSupplierPaymentRow = {
    id: string;
    date: string;
    vendorName: string;
    amountCents: number;
    txnId: string;
    docType: PaypalForeignDocType;
    jurisdiction: PaypalForeignJurisdiction;
    natureLabel: string;
    docStatus: PaypalForeignDocStatus;
    documentLabel: string | null;
    attachmentUrl: string | null;
};

export type PaypalForeignSupplierReport = {
    year: number;
    periodKey: PrimaNotaPeriodKey;
    periodLabel: string;
    start: string;
    end: string;
    rows: PaypalForeignSupplierPaymentRow[];
    totals: {
        count: number;
        totalPaidCents: number;
    };
};

type ArchiveHit = {
    vendorName: string;
    date: string;
    amountCents: number;
    hasFile: boolean;
    label: string | null;
    url: string | null;
};

function dayKey(d: Date | string | null | undefined): string {
    if (!d) return '';
    if (d instanceof Date) return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
    const m = String(d).match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
}

function daysApart(a: string, b: string): number {
    if (!a || !b) return 999;
    return Math.abs(Date.parse(`${a}T12:00:00.000Z`) - Date.parse(`${b}T12:00:00.000Z`)) / 86400000;
}

function parsePeriod(raw: string | null | undefined): PrimaNotaPeriodKey {
    return normalizePrimaNotaPeriodKey(raw) || 'YEAR';
}

async function loadArchiveHits(year: number): Promise<ArchiveHit[]> {
    const start = new Date(`${year}-01-01T00:00:00.000Z`);
    const end = new Date(`${year}-12-31T23:59:59.999Z`);
    const [manuals, saas, ledgerDocs] = await Promise.all([
        prisma.manualFinanceExpense.findMany({
            where: { expenseDate: { gte: start, lte: end } },
            select: {
                vendorName: true,
                expenseDate: true,
                totalCents: true,
                blobUrl: true,
                fileName: true,
                notes: true,
                metadataJson: true,
            },
            take: 4000,
        }),
        prisma.saasForeignInvoice.findMany({
            where: { invoiceDate: { gte: start, lte: end } },
            select: {
                vendorName: true,
                invoiceDate: true,
                eurAmountCents: true,
                blobUrl: true,
                fileName: true,
                autofatturaType: true,
            },
            take: 2000,
        }),
        prisma.financialLedgerEntry.findMany({
            where: {
                reversedAt: null,
                fiscalYear: year,
                OR: [
                    { sourceType: 'SAAS_INVOICE' },
                    { sourceType: 'MANUAL_EXPENSE' },
                    { attachmentUrl: { not: null } },
                ],
            },
            select: {
                counterpartyName: true,
                accountingDate: true,
                totalCents: true,
                attachmentUrl: true,
                description: true,
            },
            take: 4000,
        }),
    ]);

    const hits: ArchiveHit[] = [];
    for (const m of manuals) {
        const meta =
            m.metadataJson && typeof m.metadataJson === 'object'
                ? (m.metadataJson as Record<string, unknown>)
                : {};
        const isAuto =
            String(m.notes || '').startsWith('AUTOFATTURA_') ||
            Boolean(meta.isForeignAutofattura);
        hits.push({
            vendorName: m.vendorName,
            date: dayKey(m.expenseDate),
            amountCents: Math.abs(m.totalCents),
            hasFile: Boolean(m.blobUrl || m.fileName),
            label: isAuto
                ? String(meta.documentNumber || m.notes || 'Autofattura')
                : m.fileName,
            url: m.blobUrl,
        });
    }
    for (const s of saas) {
        hits.push({
            vendorName: s.vendorName,
            date: dayKey(s.invoiceDate),
            amountCents: Math.abs(s.eurAmountCents),
            hasFile: Boolean(s.blobUrl || s.fileName),
            label: s.fileName || s.autofatturaType,
            url: s.blobUrl,
        });
    }
    for (const l of ledgerDocs) {
        if (!l.attachmentUrl) continue;
        hits.push({
            vendorName: l.counterpartyName || l.description || '',
            date: dayKey(l.accountingDate),
            amountCents: Math.abs(l.totalCents),
            hasFile: true,
            label: 'Allegato ledger',
            url: l.attachmentUrl,
        });
    }
    return hits;
}

function matchArchive(
    vendorName: string,
    date: string,
    amountCents: number,
    archive: ArchiveHit[]
): ArchiveHit | null {
    let best: ArchiveHit | null = null;
    let bestScore = 0;
    for (const hit of archive) {
        if (!vendorsLikelyMatch(vendorName, hit.vendorName)) continue;
        const amountOk =
            hit.amountCents === amountCents ||
            Math.abs(hit.amountCents - amountCents) <= 2;
        const close = daysApart(date, hit.date) <= 21;
        if (!amountOk && !close) continue;
        let score = 0;
        if (amountOk) score += 50;
        if (close) score += Math.max(0, 30 - daysApart(date, hit.date));
        if (hit.hasFile) score += 10;
        if (score > bestScore) {
            bestScore = score;
            best = hit;
        }
    }
    return bestScore >= 50 ? best : null;
}

export async function listPaypalForeignSupplierPayments(opts: {
    year?: number;
    period?: string | null;
}): Promise<PaypalForeignSupplierReport> {
    const year = opts.year && Number.isFinite(opts.year) ? opts.year : 2026;
    const periodKey = parsePeriod(opts.period);
    const bounds = periodBounds(year, periodKey);
    const start = new Date(`${bounds.start}T00:00:00.000Z`);
    const end = new Date(`${bounds.end}T23:59:59.999Z`);

    const raw = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceType: 'PAYPAL_MOVEMENT',
            fiscalYear: year,
            accountingDate: { gte: start, lte: end },
        },
        orderBy: [{ accountingDate: 'asc' }, { createdAt: 'asc' }],
        take: 8000,
    });

    const reduced = applyPaypalStateMachine(raw);
    const archive = await loadArchiveHits(year);

    const rows: PaypalForeignSupplierPaymentRow[] = [];
    for (const entry of reduced) {
        if (!isPaypalForeignSupplierOutflow(entry)) continue;
        const signed = paypalSignedCents(entry);
        const { profile, displayName } = suggestPaypalForeignNature(entry);
        const date = dayKey(entry.accountingDate);
        const amountCents = signed;
        const hit = matchArchive(displayName, date, Math.abs(amountCents), archive);
        const attached = Boolean(entry.attachmentUrl) || Boolean(hit?.hasFile);
        rows.push({
            id: entry.id,
            date,
            vendorName: displayName,
            amountCents,
            txnId: paypalForeignTxnRef(entry),
            docType: profile.docType,
            jurisdiction: profile.jurisdiction,
            natureLabel: profile.natureLabel,
            docStatus: attached ? 'ATTACHED' : 'MISSING',
            documentLabel: hit?.label || (entry.attachmentUrl ? 'Allegato ledger' : null),
            attachmentUrl: entry.attachmentUrl || hit?.url || null,
        });
    }

    const totalPaidCents = rows.reduce((s, r) => s + r.amountCents, 0);
    return {
        year,
        periodKey,
        periodLabel: bounds.label,
        start: bounds.start,
        end: bounds.end,
        rows,
        totals: {
            count: rows.length,
            totalPaidCents,
        },
    };
}
