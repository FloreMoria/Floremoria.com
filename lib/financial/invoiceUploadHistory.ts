/**
 * Storico file caricati Contabilità (SDI ZIP/XML e report XLSX).
 * Persistenza in SystemState per elenco compatto senza nuova tabella.
 */

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
};

const HISTORY_KEY = 'finance.invoice.uploads';
const MAX_RECORDS = 80;

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

export async function recordInvoiceUpload(input: {
    channel: InvoiceUploadChannel;
    fileName: string;
    sizeBytes: number;
    invoiceCount: number;
    imported: number;
    updated: number;
    skippedDuplicates: number;
}): Promise<InvoiceUploadRecord> {
    const record: InvoiceUploadRecord = {
        id: `upl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        channel: input.channel,
        fileName: input.fileName.slice(0, 255),
        uploadedAt: new Date().toISOString(),
        sizeBytes: Math.max(0, Math.round(input.sizeBytes || 0)),
        invoiceCount: Math.max(0, input.invoiceCount),
        imported: input.imported,
        updated: input.updated,
        skippedDuplicates: input.skippedDuplicates,
    };
    const prev = await readHistory();
    // Aggiorna eventuale stesso nome+canale in testa (ultimo upload)
    const filtered = prev.filter(
        (r) =>
            !(
                r.channel === record.channel &&
                normalizeFileName(r.fileName) === normalizeFileName(record.fileName)
            )
    );
    await writeHistory([record, ...filtered]);
    return record;
}
