/**
 * Ingestione massiva fatture SDI/YouDoox → manual_finance_expenses + match Fineco.
 */

import * as fs from 'fs';
import * as path from 'path';
import { del } from '@vercel/blob';
import prisma from '@/lib/prisma';
import { putBlobWithAccessFallback } from '@/lib/blob/storeAccess';
import { addAccountingEntries } from '@/lib/financial/ledgerStore';
import { LEDGER_BANK_ACCOUNT } from '@/lib/financial/companyBankDetails';
import type { AccountingEntry } from '@/lib/financial/types';
import {
    parseInvoiceUpload,
    type ParsedFatturaPa,
} from '@/lib/financial/parseFatturaPaXml';
import type { Prisma } from '@prisma/client';

const LOCAL_DIR = path.join(process.cwd(), 'data', 'sdi-invoices');
const BLOB_PREFIX = 'floremoria-finance/sdi-invoices';

export type SdiIngestSummary = {
    imported: number;
    skippedDuplicates: number;
    skippedErrors: number;
    matchedFineco: number;
    totalCents: number;
    warnings: string[];
    skippedDetails: Array<{ fileName: string; reason: string }>;
    sampleVendors: string[];
};

function getBlobToken(): string | null {
    return process.env.BLOB_READ_WRITE_TOKEN?.trim() || null;
}

function periodKeyFromDate(d: Date): string {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function sanitizeFileName(name: string): string {
    return name.replace(/[^\w.\-()+ ]+/g, '_').slice(0, 180);
}

function normalizeVendor(s: string): string {
    return s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim();
}

async function storeArchive(
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

async function findExistingByDedupeKey(dedupeKey: string) {
    // Preferenza: filtro JSON Prisma (Postgres)
    try {
        const hit = await prisma.manualFinanceExpense.findFirst({
            where: {
                metadataJson: {
                    path: ['dedupeKey'],
                    equals: dedupeKey,
                },
            },
            select: { id: true },
        });
        if (hit) return hit;
    } catch {
        // fallback sotto
    }
    const recent = await prisma.manualFinanceExpense.findMany({
        where: { docType: 'FATTURA' },
        orderBy: { createdAt: 'desc' },
        take: 400,
        select: { id: true, metadataJson: true, notes: true },
    });
    return (
        recent.find((r) => {
            const meta = r.metadataJson as { dedupeKey?: string } | null;
            return meta?.dedupeKey === dedupeKey || (r.notes || '').includes(dedupeKey);
        }) || null
    );
}

function vendorCompatible(invoiceVendor: string, bankDescription: string): boolean {
    const a = normalizeVendor(invoiceVendor);
    const b = normalizeVendor(bankDescription);
    if (!a || !b) return false;
    if (b.includes(a) || a.includes(b)) return true;
    const tokens = a.split(' ').filter((t) => t.length > 3);
    let hits = 0;
    for (const t of tokens.slice(0, 4)) {
        if (b.includes(t)) hits += 1;
    }
    return hits >= 1;
}

async function reconcileInvoiceWithFineco(expense: {
    id: string;
    vendorName: string;
    totalCents: number;
    expenseDate: Date;
    vendorVat?: string | null;
}): Promise<boolean> {
    const abs = Math.abs(expense.totalCents);
    const from = new Date(expense.expenseDate.getTime() - 45 * 24 * 60 * 60 * 1000);
    const to = new Date(expense.expenseDate.getTime() + 20 * 24 * 60 * 60 * 1000);
    const vatDigits = (expense.vendorVat || '').replace(/\D/g, '');

    const candidates = await prisma.bankStatementLine.findMany({
        where: {
            matchStatus: { not: 'MATCHED' },
            amountCents: { in: [-abs, abs] },
            OR: [
                { accountingDate: { gte: from, lte: to } },
                { valueDate: { gte: from, lte: to } },
                { accountingDate: null, valueDate: null },
            ],
        },
        orderBy: { accountingDate: 'desc' },
        take: 40,
    });

    const hit = candidates.find((c) => {
        if (c.amountCents >= 0) return false;
        if (vendorCompatible(expense.vendorName, c.description)) return true;
        if (vatDigits.length >= 8 && c.description.replace(/\D/g, '').includes(vatDigits)) return true;
        return false;
    });
    if (!hit) return false;

    await prisma.$transaction([
        prisma.bankStatementLine.update({
            where: { id: hit.id },
            data: {
                matchStatus: 'MATCHED',
                matchType: 'SDI_INVOICE',
                matchScore: 94,
                matchedTxId: expense.id,
                matchNotes: `Riconciliato — fattura ${expense.vendorName} (€${(abs / 100).toFixed(2)})`,
            },
        }),
        prisma.manualFinanceExpense.update({
            where: { id: expense.id },
            data: {
                reconciled: true,
                matchedStatementLineId: hit.id,
            },
        }),
    ]);

    // Aggiorna contatori documento se presente
    if (hit.documentId) {
        const [matchedCount, unmatchedCount] = await Promise.all([
            prisma.bankStatementLine.count({
                where: { documentId: hit.documentId, matchStatus: 'MATCHED' },
            }),
            prisma.bankStatementLine.count({
                where: { documentId: hit.documentId, matchStatus: { not: 'MATCHED' } },
            }),
        ]);
        await prisma.bankStatementDocument.update({
            where: { id: hit.documentId },
            data: { matchedCount, unmatchedCount },
        });
    }

    return true;
}

async function persistInvoice(
    inv: ParsedFatturaPa,
    archive: { blobPath: string | null; blobUrl: string | null; storageKind: string; fileName: string },
    source: 'SDI_XML' | 'SDI_XLSX'
) {
    const expenseDate = new Date(`${inv.invoiceDate}T12:00:00.000Z`);
    const metadata: Prisma.InputJsonValue = {
        source,
        isDeductible: true,
        dedupeKey: inv.dedupeKey,
        vendorVat: inv.vendorVat,
        invoiceNumber: inv.invoiceNumber,
        lineDescriptions: inv.lineDescriptions,
        sourceFileName: inv.sourceFileName,
        archiveFileName: archive.fileName,
    };

    const contentType =
        source === 'SDI_XLSX'
            ? archive.fileName.toLowerCase().endsWith('.csv')
                ? 'text/csv'
                : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'application/xml';

    const row = await prisma.manualFinanceExpense.create({
        data: {
            expenseDate,
            docType: 'FATTURA',
            vendorName: inv.vendorName,
            description: inv.causale || `Fattura n. ${inv.invoiceNumber}`,
            totalCents: inv.totalCents,
            vatRate: inv.vatRate,
            vatCents: inv.vatCents,
            netCents: inv.netCents,
            fileName: archive.fileName,
            contentType,
            sizeBytes: null,
            blobPath: archive.blobPath,
            blobUrl: archive.blobUrl,
            storageKind: archive.storageKind,
            periodKey: periodKeyFromDate(expenseDate),
            notes: `${source} ${inv.dedupeKey}`,
            metadataJson: metadata,
            reconciled: false,
        },
    });

    const entry: AccountingEntry = {
        id: `entry_sdi_${row.id}`,
        date: inv.invoiceDate,
        description: `Fattura ${source === 'SDI_XLSX' ? 'report' : 'SDI'} ${inv.vendorName} n. ${inv.invoiceNumber}`.slice(
            0,
            240
        ),
        dareAccount: '70900 - Spese Generali / Fatture Passive',
        avereAccount: LEDGER_BANK_ACCOUNT,
        amountCents: inv.totalCents,
        vatAmountCents: inv.vatCents,
        isForeignService: false,
        invoiceReference: inv.invoiceNumber,
        status: 'CONFIRMED',
    };
    addAccountingEntries([entry]);

    return row;
}

/**
 * Ingestione generica fatture passive già parsate.
 */
export async function ingestParsedPassiveInvoices(input: {
    invoices: ParsedFatturaPa[];
    skipped: Array<{ fileName: string; reason: string }>;
    warnings: string[];
    buffer: Buffer;
    fileName: string;
    contentType?: string;
    source: 'SDI_XML' | 'SDI_XLSX';
}): Promise<SdiIngestSummary> {
    const warnings = [...input.warnings];
    const skippedDetails = [...input.skipped];

    let imported = 0;
    let skippedDuplicates = 0;
    let matchedFineco = 0;
    let totalCents = 0;
    const sampleVendors: string[] = [];

    let archive = {
        blobPath: null as string | null,
        blobUrl: null as string | null,
        storageKind: 'none',
        fileName: input.fileName,
    };

    if (input.invoices.length > 0) {
        try {
            const stored = await storeArchive(
                input.buffer,
                input.fileName,
                input.contentType || 'application/octet-stream'
            );
            archive = {
                blobPath: stored.blobPath,
                blobUrl: stored.blobUrl,
                storageKind: stored.storageKind,
                fileName: input.fileName,
            };
        } catch (err) {
            warnings.push(
                `Archivio originale non salvato su Blob (${err instanceof Error ? err.message : String(err)}); fatture comunque importate.`
            );
        }
    }

    for (const inv of input.invoices) {
        try {
            const existing = await findExistingByDedupeKey(inv.dedupeKey);
            if (existing) {
                skippedDuplicates += 1;
                skippedDetails.push({
                    fileName: inv.sourceFileName,
                    reason: `Duplicato ${inv.dedupeKey}`,
                });
                continue;
            }

            const row = await persistInvoice(inv, archive, input.source);
            imported += 1;
            totalCents += inv.totalCents;
            if (sampleVendors.length < 8 && !sampleVendors.includes(inv.vendorName)) {
                sampleVendors.push(inv.vendorName);
            }

            const matched = await reconcileInvoiceWithFineco({
                id: row.id,
                vendorName: inv.vendorName,
                totalCents: inv.totalCents,
                expenseDate: row.expenseDate,
                vendorVat: inv.vendorVat,
            });
            if (matched) matchedFineco += 1;
        } catch (err) {
            skippedDetails.push({
                fileName: inv.sourceFileName,
                reason: err instanceof Error ? err.message : String(err),
            });
        }
    }

    if (imported === 0 && archive.storageKind === 'blob' && (archive.blobUrl || archive.blobPath)) {
        const token = getBlobToken();
        if (token) {
            try {
                await del(archive.blobUrl || archive.blobPath!, { token });
            } catch {
                /* ignore */
            }
        }
    }

    return {
        imported,
        skippedDuplicates,
        skippedErrors: Math.max(0, skippedDetails.length - skippedDuplicates),
        matchedFineco,
        totalCents,
        warnings,
        skippedDetails: skippedDetails.slice(0, 40),
        sampleVendors,
    };
}

/**
 * Upload ZIP/XML/CSV → parsing → insert deduplicato → riconciliazione Fineco.
 */
export async function ingestSdiInvoiceUpload(input: {
    buffer: Buffer;
    fileName: string;
    contentType?: string;
}): Promise<SdiIngestSummary> {
    const parsed = await parseInvoiceUpload(input.buffer, input.fileName, input.contentType);
    return ingestParsedPassiveInvoices({
        invoices: parsed.invoices,
        skipped: parsed.skipped,
        warnings: parsed.warnings,
        buffer: input.buffer,
        fileName: input.fileName,
        contentType: input.contentType,
        source: 'SDI_XML',
    });
}

/**
 * Upload report .xlsx/.csv fatture ricevute.
 */
export async function ingestReceivedInvoicesXlsxUpload(input: {
    buffer: Buffer;
    fileName: string;
    contentType?: string;
}): Promise<SdiIngestSummary> {
    const { parseReceivedInvoicesReport } = await import('@/lib/financial/parseReceivedInvoicesXlsx');
    const parsed = await parseReceivedInvoicesReport(
        input.buffer,
        input.fileName,
        input.contentType
    );
    return ingestParsedPassiveInvoices({
        invoices: parsed.invoices,
        skipped: parsed.skipped,
        warnings: parsed.warnings,
        buffer: input.buffer,
        fileName: input.fileName,
        contentType: input.contentType,
        source: 'SDI_XLSX',
    });
}
