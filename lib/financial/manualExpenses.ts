/**
 * Spese / documenti manuali Contabilità (fatture, scontrini, ricevute).
 */

import * as fs from 'fs';
import * as path from 'path';
import { del } from '@vercel/blob';
import prisma from '@/lib/prisma';
import { putBlobWithAccessFallback } from '@/lib/blob/storeAccess';
import { addAccountingEntries } from '@/lib/financial/ledgerStore';
import { LEDGER_BANK_ACCOUNT } from '@/lib/financial/companyBankDetails';
import type { AccountingEntry } from '@/lib/financial/types';

const LOCAL_DIR = path.join(process.cwd(), 'data', 'manual-expenses');
const BLOB_PREFIX = 'floremoria-finance/manual-expenses';

export type ManualDocType = 'FATTURA' | 'SCONTRINO' | 'RICEVUTA';

function getBlobToken(): string | null {
    return process.env.BLOB_READ_WRITE_TOKEN?.trim() || null;
}

function periodKeyFromDate(d: Date): string {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function sanitizeFileName(name: string): string {
    return name.replace(/[^\w.\-()+ ]+/g, '_').slice(0, 180);
}

async function storeAttachment(
    buffer: Buffer,
    fileName: string,
    contentType: string
): Promise<{ blobPath: string; blobUrl: string | null; storageKind: 'blob' | 'local' }> {
    const safe = sanitizeFileName(fileName);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const token = getBlobToken();
    if (token) {
        const blobPath = `${BLOB_PREFIX}/${stamp}_${safe}`;
        const result = await putBlobWithAccessFallback(blobPath, buffer, {
            contentType,
            token,
            addRandomSuffix: false,
        });
        return { blobPath: result.pathname || blobPath, blobUrl: result.url, storageKind: 'blob' };
    }
    if (!fs.existsSync(LOCAL_DIR)) fs.mkdirSync(LOCAL_DIR, { recursive: true });
    const full = path.join(LOCAL_DIR, `${stamp}_${safe}`);
    fs.writeFileSync(full, buffer);
    return { blobPath: full, blobUrl: null, storageKind: 'local' };
}

export async function listManualExpenses(limit = 100) {
    return prisma.manualFinanceExpense.findMany({
        orderBy: { expenseDate: 'desc' },
        take: Math.min(Math.max(limit, 1), 300),
    });
}

export async function sumManualExpensesCents(): Promise<number> {
    const agg = await prisma.manualFinanceExpense.aggregate({ _sum: { totalCents: true } });
    return agg._sum.totalCents || 0;
}

export async function createManualExpense(input: {
    expenseDate: string;
    docType: ManualDocType;
    vendorName: string;
    description: string;
    totalCents: number;
    vatRate: number;
    file?: { buffer: Buffer; fileName: string; contentType: string } | null;
    notes?: string | null;
}) {
    const expenseDate = new Date(`${input.expenseDate.slice(0, 10)}T12:00:00.000Z`);
    if (Number.isNaN(expenseDate.getTime())) throw new Error('Data non valida');

    const totalCents = Math.round(input.totalCents);
    if (!Number.isFinite(totalCents) || totalCents <= 0) throw new Error('Importo non valido');

    const vatRate = Number.isFinite(input.vatRate) ? input.vatRate : 0;
    const vatCents =
        vatRate > 0 ? Math.round(totalCents - totalCents / (1 + vatRate / 100)) : 0;
    const netCents = totalCents - vatCents;

    let stored: { blobPath: string | null; blobUrl: string | null; storageKind: string; fileName: string | null; contentType: string | null; sizeBytes: number | null } = {
        blobPath: null,
        blobUrl: null,
        storageKind: 'none',
        fileName: null,
        contentType: null,
        sizeBytes: null,
    };

    if (input.file) {
        const up = await storeAttachment(
            input.file.buffer,
            input.file.fileName,
            input.file.contentType
        );
        stored = {
            blobPath: up.blobPath,
            blobUrl: up.blobUrl,
            storageKind: up.storageKind,
            fileName: input.file.fileName,
            contentType: input.file.contentType,
            sizeBytes: input.file.buffer.byteLength,
        };
    }

    const row = await prisma.manualFinanceExpense.create({
        data: {
            expenseDate,
            docType: input.docType,
            vendorName: input.vendorName.trim(),
            description: input.description.trim(),
            totalCents,
            vatRate,
            vatCents,
            netCents,
            fileName: stored.fileName,
            contentType: stored.contentType,
            sizeBytes: stored.sizeBytes,
            blobPath: stored.blobPath,
            blobUrl: stored.blobUrl,
            storageKind: stored.storageKind,
            periodKey: periodKeyFromDate(expenseDate),
            notes: input.notes?.trim() || null,
        },
    });

    // Prima nota uscite (conto costi generici / SaaS se suggerito dalla causale)
    const descUpper = `${input.vendorName} ${input.description}`.toUpperCase();
    const dareAccount =
        /VERCEL|OPENAI|GOOGLE|AWS|CURSOR|ANTHROPIC|META|STRIPE|SAAS|SOFTWARE/.test(descUpper)
            ? '70300 - Software SaaS (Estero)'
            : '70900 - Spese Generali / Varie';

    const entry: AccountingEntry = {
        id: `entry_manual_exp_${row.id}`,
        date: expenseDate.toISOString().slice(0, 10),
        description: `${input.docType} ${input.vendorName} — ${input.description}`.slice(0, 240),
        dareAccount,
        avereAccount: LEDGER_BANK_ACCOUNT,
        amountCents: totalCents,
        vatAmountCents: vatCents,
        isForeignService: dareAccount.includes('SaaS'),
        invoiceReference: row.id.slice(-8).toUpperCase(),
        status: 'CONFIRMED',
    };
    addAccountingEntries([entry]);

    return row;
}

export async function deleteManualExpense(id: string) {
    const row = await prisma.manualFinanceExpense.findUnique({ where: { id } });
    if (!row) return false;
    if (row.storageKind === 'local' && row.blobPath && fs.existsSync(row.blobPath)) {
        fs.unlinkSync(row.blobPath);
    } else if (row.storageKind === 'blob') {
        const token = getBlobToken();
        if (token && (row.blobUrl || row.blobPath)) {
            try {
                await del(row.blobUrl || row.blobPath!, { token });
            } catch (err) {
                console.warn('[manual-expenses] delete blob', err);
            }
        }
    }
    await prisma.manualFinanceExpense.delete({ where: { id } });
    return true;
}

/** Match uscite estratto vs spese manuali non ancora riconciliate. */
export async function matchManualExpenseByAmount(
    amountCentsAbs: number,
    accountingDateIso: string | null,
    description: string
): Promise<{ id: string; vendorName: string } | null> {
    const candidates = await prisma.manualFinanceExpense.findMany({
        where: {
            reconciled: false,
            totalCents: amountCentsAbs,
        },
        orderBy: { expenseDate: 'desc' },
        take: 40,
    });
    if (!candidates.length) return null;

    const desc = description.toUpperCase();
    const scored = candidates.map((c) => {
        let score = 50;
        if (desc.includes(c.vendorName.toUpperCase().slice(0, 8))) score += 40;
        if (accountingDateIso) {
            const d = Math.abs(
                Date.parse(accountingDateIso) - c.expenseDate.getTime()
            );
            if (d <= 5 * 24 * 60 * 60 * 1000) score += 20;
        }
        return { c, score };
    });
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (!best || best.score < 50) return null;
    return { id: best.c.id, vendorName: best.c.vendorName };
}

export async function markManualExpenseReconciled(
    id: string,
    statementLineId: string | null
) {
    await prisma.manualFinanceExpense.update({
        where: { id },
        data: {
            reconciled: true,
            matchedStatementLineId: statementLineId,
        },
    });
}
