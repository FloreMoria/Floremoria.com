/**
 * Storico file caricati Contabilità (SDI ZIP/XML e report XLSX).
 * Persistenza in SystemState + join sulle spese via metadata.uploadId / archiveFileName.
 */

import * as fs from 'fs';
import { del } from '@vercel/blob';
import prisma from '@/lib/prisma';

export type InvoiceUploadChannel = 'SDI_XML' | 'SDI_XLSX';

export type InvoiceUploadRecord = {
    id: string;
    channel: InvoiceUploadChannel;
    fileName: string;
    uploadedAt: string; // ISO
    sizeBytes: number;
    invoiceCount: number;
    imported: number;
    updated: number;
    skippedDuplicates: number;
    totalNetCents?: number;
    passiveCount?: number;
    foreignCount?: number;
    activeCount?: number;
    filesProcessed?: number;
};

export type UploadInvoiceDetail = {
    id: string;
    vendorName: string;
    invoiceNumber: string | null;
    expenseDate: string;
    totalCents: number;
    netCents: number;
    vatCents: number;
    reconciled: boolean;
    invoiceRole: string;
    vendorVat: string | null;
    source: string | null;
};

const HISTORY_KEY = 'finance.invoice.uploads';
const MAX_RECORDS = 80;

function getBlobToken(): string | null {
    return process.env.BLOB_READ_WRITE_TOKEN?.trim() || null;
}

function normalizeFileName(name: string): string {
    return String(name || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

async function readHistory(): Promise<InvoiceUploadRecord[]> {
    const row = await prisma.systemState.findUnique({ where: { key: HISTORY_KEY } });
    if (!row?.value) return [];
    try {
        const parsed = JSON.parse(row.value) as InvoiceUploadRecord[];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

async function writeHistory(records: InvoiceUploadRecord[]): Promise<void> {
    await prisma.systemState.upsert({
        where: { key: HISTORY_KEY },
        create: { key: HISTORY_KEY, value: JSON.stringify(records.slice(0, MAX_RECORDS)) },
        update: { value: JSON.stringify(records.slice(0, MAX_RECORDS)) },
    });
}

export async function listInvoiceUploads(
    channel?: InvoiceUploadChannel
): Promise<InvoiceUploadRecord[]> {
    const all = await readHistory();
    const filtered = channel ? all.filter((r) => r.channel === channel) : all;
    return filtered.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export async function findUploadByFileName(
    fileName: string,
    channel?: InvoiceUploadChannel
): Promise<InvoiceUploadRecord | null> {
    const norm = normalizeFileName(fileName);
    if (!norm) return null;
    const all = await listInvoiceUploads(channel);
    return all.find((r) => normalizeFileName(r.fileName) === norm) || null;
}

export async function getUploadById(id: string): Promise<InvoiceUploadRecord | null> {
    const all = await readHistory();
    return all.find((r) => r.id === id) || null;
}

export async function recordInvoiceUpload(input: {
    id?: string;
    channel: InvoiceUploadChannel;
    fileName: string;
    sizeBytes: number;
    invoiceCount: number;
    imported: number;
    updated: number;
    skippedDuplicates: number;
    totalNetCents?: number;
    passiveCount?: number;
    foreignCount?: number;
    activeCount?: number;
    filesProcessed?: number;
}): Promise<InvoiceUploadRecord> {
    const record: InvoiceUploadRecord = {
        id: input.id || `upl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        channel: input.channel,
        fileName: input.fileName.slice(0, 255),
        uploadedAt: new Date().toISOString(),
        sizeBytes: Math.max(0, Math.round(input.sizeBytes || 0)),
        invoiceCount: Math.max(0, input.invoiceCount),
        imported: input.imported,
        updated: input.updated,
        skippedDuplicates: input.skippedDuplicates,
        totalNetCents: input.totalNetCents ?? 0,
        passiveCount: input.passiveCount ?? 0,
        foreignCount: input.foreignCount ?? 0,
        activeCount: input.activeCount ?? 0,
        filesProcessed: input.filesProcessed ?? 1,
    };
    const prev = await readHistory();
    const filtered = prev.filter(
        (r) =>
            !(
                r.channel === record.channel &&
                normalizeFileName(r.fileName) === normalizeFileName(record.fileName)
            ) && r.id !== record.id
    );
    await writeHistory([record, ...filtered]);
    return record;
}

export async function listInvoicesForUpload(uploadId: string): Promise<{
    upload: InvoiceUploadRecord;
    invoices: UploadInvoiceDetail[];
}> {
    const upload = await getUploadById(uploadId);
    if (!upload) throw new Error('Upload non trovato');

    const rows = await prisma.manualFinanceExpense.findMany({
        where: {
            OR: [
                { fileName: upload.fileName },
                {
                    metadataJson: {
                        path: ['uploadId'],
                        equals: uploadId,
                    },
                },
                {
                    metadataJson: {
                        path: ['archiveFileName'],
                        equals: upload.fileName,
                    },
                },
            ],
        },
        orderBy: { expenseDate: 'desc' },
        take: 500,
    });

    const invoices: UploadInvoiceDetail[] = rows.map((r) => {
        const meta = (r.metadataJson || {}) as Record<string, unknown>;
        return {
            id: r.id,
            vendorName: r.vendorName,
            invoiceNumber:
                typeof meta.invoiceNumber === 'string'
                    ? meta.invoiceNumber
                    : typeof meta.documentNumber === 'string'
                      ? meta.documentNumber
                      : null,
            expenseDate: r.expenseDate.toISOString().slice(0, 10),
            totalCents: r.totalCents,
            netCents: r.netCents,
            vatCents: r.vatCents,
            reconciled: Boolean(r.reconciled),
            invoiceRole: String(meta.invoiceRole || meta.source || 'PASSIVE'),
            vendorVat: typeof meta.vendorVat === 'string' ? meta.vendorVat : null,
            source: typeof meta.source === 'string' ? meta.source : null,
        };
    });

    return { upload, invoices };
}

async function unlinkFinecoMatch(expenseId: string, lineId: string | null) {
    if (!lineId) return;
    try {
        const line = await prisma.bankStatementLine.findUnique({ where: { id: lineId } });
        if (!line) return;
        await prisma.bankStatementLine.update({
            where: { id: lineId },
            data: {
                matchStatus: 'UNMATCHED',
                matchType: null,
                matchScore: null,
                matchedTxId: null,
                matchNotes: `Scollegato: upload fatture ${expenseId} eliminato`,
            },
        });
        if (line.documentId) {
            const [matchedCount, unmatchedCount] = await Promise.all([
                prisma.bankStatementLine.count({
                    where: { documentId: line.documentId, matchStatus: 'MATCHED' },
                }),
                prisma.bankStatementLine.count({
                    where: { documentId: line.documentId, matchStatus: { not: 'MATCHED' } },
                }),
            ]);
            await prisma.bankStatementDocument.update({
                where: { id: line.documentId },
                data: { matchedCount, unmatchedCount },
            });
        }
    } catch (err) {
        console.warn('[uploads] unlink fineco', err);
    }
}

export async function deleteInvoiceUpload(uploadId: string): Promise<{
    deletedExpenses: number;
}> {
    const upload = await getUploadById(uploadId);
    if (!upload) throw new Error('Upload non trovato');

    const { invoices } = await listInvoicesForUpload(uploadId);
    let deletedExpenses = 0;

    for (const inv of invoices) {
        const row = await prisma.manualFinanceExpense.findUnique({ where: { id: inv.id } });
        if (!row) continue;
        await unlinkFinecoMatch(row.id, row.matchedStatementLineId);
        try {
            await prisma.financialLedgerEntry.updateMany({
                where: {
                    OR: [
                        { sourceId: row.id, sourceType: 'MANUAL_EXPENSE' },
                        { sourceKey: `MANUAL_EXPENSE:${row.id}` },
                        ...(typeof (row.metadataJson as any)?.dedupeKey === 'string'
                            ? [
                                  {
                                      sourceKey: `SDI_ACTIVE:${(row.metadataJson as any).dedupeKey}`.slice(
                                          0,
                                          180
                                      ),
                                  },
                              ]
                            : []),
                    ],
                    reversedAt: null,
                },
                data: { reversedAt: new Date() },
            });
        } catch {
            /* ignore */
        }
        if (row.storageKind === 'local' && row.blobPath && fs.existsSync(row.blobPath)) {
            try {
                fs.unlinkSync(row.blobPath);
            } catch {
                /* ignore */
            }
        } else if (row.storageKind === 'blob') {
            const token = getBlobToken();
            if (token && (row.blobUrl || row.blobPath)) {
                try {
                    await del(row.blobUrl || row.blobPath!, { token });
                } catch {
                    /* ignore */
                }
            }
        }
        await prisma.manualFinanceExpense.delete({ where: { id: row.id } });
        deletedExpenses += 1;
    }

    const prev = await readHistory();
    await writeHistory(prev.filter((r) => r.id !== uploadId));

    return { deletedExpenses };
}
