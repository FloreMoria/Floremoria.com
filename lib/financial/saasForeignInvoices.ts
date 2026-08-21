/**
 * Archivio fatture SaaS / estere + storage Blob/locale.
 */

import * as fs from 'fs';
import * as path from 'path';
import { del } from '@vercel/blob';
import JSZip from 'jszip';
import prisma from '@/lib/prisma';
import { putBlobWithAccessFallback, getBlobWithAccessFallback } from '@/lib/blob/storeAccess';

const LOCAL_DIR = path.join(process.cwd(), 'data', 'saas-invoices');
const BLOB_PREFIX = 'floremoria-finance/saas-invoices';

function getBlobToken(): string | null {
    return process.env.BLOB_READ_WRITE_TOKEN?.trim() || null;
}

function ensureLocalDir() {
    if (!fs.existsSync(LOCAL_DIR)) fs.mkdirSync(LOCAL_DIR, { recursive: true });
}

function sanitizeFileName(name: string): string {
    return name.replace(/[^\w.\-()+ ]+/g, '_').slice(0, 180);
}

function periodKeyFromDate(d: Date): string {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function storeFile(
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
    ensureLocalDir();
    const full = path.join(LOCAL_DIR, `${stamp}_${safe}`);
    fs.writeFileSync(full, buffer);
    return { blobPath: full, blobUrl: null, storageKind: 'local' };
}

async function readBytes(
    blobPath: string,
    storageKind: string,
    blobUrl: string | null
): Promise<Buffer> {
    if (storageKind === 'local' || blobPath.startsWith('/') || blobPath.includes(path.sep)) {
        return fs.readFileSync(blobPath);
    }
    try {
        const blob = await getBlobWithAccessFallback(blobPath, {});
        if (blob?.stream && blob.statusCode === 200) {
            const chunks: Uint8Array[] = [];
            const reader = blob.stream.getReader();
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value) chunks.push(value);
            }
            const total = chunks.reduce((n, c) => n + c.length, 0);
            const out = new Uint8Array(total);
            let offset = 0;
            for (const c of chunks) {
                out.set(c, offset);
                offset += c.length;
            }
            return Buffer.from(out);
        }
    } catch (err) {
        console.warn('[saas-invoices] blob get failed', err);
    }
    if (!blobUrl) throw new Error('File non raggiungibile');
    const token = getBlobToken();
    const res = await fetch(blobUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) throw new Error(`Download fallito (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
}

export async function listSaasForeignInvoices(periodKey?: string) {
    return prisma.saasForeignInvoice.findMany({
        where: periodKey ? { periodKey } : undefined,
        orderBy: { invoiceDate: 'desc' },
    });
}

export async function sumSaasForeignEurCents(): Promise<number> {
    const agg = await prisma.saasForeignInvoice.aggregate({ _sum: { eurAmountCents: true } });
    return agg._sum.eurAmountCents || 0;
}

export async function uploadSaasForeignInvoice(input: {
    fileName: string;
    contentType: string;
    buffer: Buffer;
    invoiceDate: string;
    vendorName: string;
    originalCurrency: string;
    originalAmountCents: number;
    eurAmountCents: number;
    countryCode?: string | null;
    jurisdiction: 'UE' | 'EXTRA_UE';
    autofatturaType: 'NONE' | 'TD17' | 'TD18' | 'TD19';
    notes?: string | null;
}) {
    const invoiceDate = new Date(`${input.invoiceDate.slice(0, 10)}T12:00:00.000Z`);
    if (Number.isNaN(invoiceDate.getTime())) {
        throw new Error('Data fattura non valida');
    }
    const stored = await storeFile(input.buffer, input.fileName, input.contentType);
    return prisma.saasForeignInvoice.create({
        data: {
            invoiceDate,
            vendorName: input.vendorName.trim(),
            originalCurrency: (input.originalCurrency || 'EUR').toUpperCase().slice(0, 8),
            originalAmountCents: Math.round(input.originalAmountCents),
            eurAmountCents: Math.round(input.eurAmountCents),
            countryCode: input.countryCode?.trim().toUpperCase() || null,
            jurisdiction: input.jurisdiction,
            autofatturaType: input.autofatturaType,
            fileName: input.fileName,
            contentType: input.contentType || 'application/octet-stream',
            sizeBytes: input.buffer.byteLength,
            blobPath: stored.blobPath,
            blobUrl: stored.blobUrl,
            storageKind: stored.storageKind,
            periodKey: periodKeyFromDate(invoiceDate),
            notes: input.notes?.trim() || null,
        },
    });
}

export async function deleteSaasForeignInvoice(id: string) {
    const row = await prisma.saasForeignInvoice.findUnique({ where: { id } });
    if (!row) return false;
    if (row.storageKind === 'local' && fs.existsSync(row.blobPath)) {
        fs.unlinkSync(row.blobPath);
    } else {
        const token = getBlobToken();
        if (token) {
            try {
                await del(row.blobUrl || row.blobPath, { token });
            } catch (err) {
                console.warn('[saas-invoices] delete blob', err);
            }
        }
    }
    await prisma.saasForeignInvoice.delete({ where: { id } });
    return true;
}

export async function buildSaasInvoicesZip(year: number, month: number): Promise<{
    zipBuffer: Buffer;
    fileName: string;
    count: number;
}> {
    const periodKey = `${year}-${String(month).padStart(2, '0')}`;
    const rows = await prisma.saasForeignInvoice.findMany({
        where: { periodKey },
        orderBy: { invoiceDate: 'asc' },
    });
    if (rows.length === 0) {
        throw new Error(`Nessuna fattura SaaS/estera per ${periodKey}`);
    }

    const zip = new JSZip();
    const indexLines = [
        'invoiceDate;vendor;currency;originalCents;eurCents;jurisdiction;autofattura;file',
    ];

    for (const row of rows) {
        const bytes = await readBytes(row.blobPath, row.storageKind, row.blobUrl);
        const safeVendor = sanitizeFileName(row.vendorName).replace(/\s+/g, '_');
        const day = row.invoiceDate.toISOString().slice(0, 10);
        const entryName = `${day}_${safeVendor}_${row.id.slice(-6)}_${row.fileName}`;
        zip.file(entryName, bytes);
        indexLines.push(
            [
                day,
                row.vendorName,
                row.originalCurrency,
                row.originalAmountCents,
                row.eurAmountCents,
                row.jurisdiction,
                row.autofatturaType,
                entryName,
            ].join(';')
        );
    }
    zip.file(`indice_${periodKey}.csv`, '\uFEFF' + indexLines.join('\n'));

    const zipBuffer = Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
    return {
        zipBuffer,
        fileName: `Fatture_SaaS_Estere_FloreMoria_${periodKey}.zip`,
        count: rows.length,
    };
}

export async function getSaasInvoiceFile(id: string) {
    const row = await prisma.saasForeignInvoice.findUnique({ where: { id } });
    if (!row) return null;
    const bytes = await readBytes(row.blobPath, row.storageKind, row.blobUrl);
    return { row, bytes };
}
