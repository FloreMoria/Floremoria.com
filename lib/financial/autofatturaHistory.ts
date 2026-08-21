/**
 * Listing e riscarica XML autofatture TD17/TD18 generate.
 */

import * as fs from 'fs';
import * as path from 'path';
import prisma from '@/lib/prisma';
import { getBlobWithAccessFallback } from '@/lib/blob/storeAccess';
import {
    AUTOFATTURA_VENDOR_PRESETS,
    generateAutofatturaXml,
    type AutofatturaDocType,
    type ForeignVendorPreset,
} from '@/lib/financial/generateAutofatturaXml';

export type AutofatturaHistoryItem = {
    id: string;
    documentNumber: string;
    vendorName: string;
    autofatturaDate: string;
    foreignInvoiceDate: string | null;
    foreignInvoiceNumber: string | null;
    imponibileCents: number;
    vatCents: number;
    totaleCents: number;
    docType: string;
    reconciled: boolean;
    fileName: string | null;
    createdAt: string;
};

function getBlobToken(): string | null {
    return process.env.BLOB_READ_WRITE_TOKEN?.trim() || null;
}

async function readStoredBytes(
    blobPath: string,
    storageKind: string,
    blobUrl: string | null
): Promise<Buffer | null> {
    try {
        if (storageKind === 'local' || blobPath.startsWith('/') || blobPath.includes(path.sep)) {
            if (fs.existsSync(blobPath)) return fs.readFileSync(blobPath);
            return null;
        }
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
        if (blobUrl) {
            const token = getBlobToken();
            const res = await fetch(blobUrl, {
                headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            });
            if (res.ok) return Buffer.from(await res.arrayBuffer());
        }
    } catch (err) {
        console.warn('[autofatture history] read xml', err);
    }
    return null;
}

function guessVendorPreset(vendorName: string): ForeignVendorPreset {
    const u = vendorName.toUpperCase();
    const hit =
        AUTOFATTURA_VENDOR_PRESETS.find((p) =>
            u.includes(p.denominazione.split(' ')[0].toUpperCase())
        ) ||
        AUTOFATTURA_VENDOR_PRESETS.find((p) => u.includes(p.label.split(' ')[0].toUpperCase()));
    return hit || AUTOFATTURA_VENDOR_PRESETS[0];
}

export async function listGeneratedAutofatture(): Promise<AutofatturaHistoryItem[]> {
    // notes: "AUTOFATTURA_TD17 000001-2026-EST" — filtro stabile senza JSON path DB-specific.
    const rows = await prisma.manualFinanceExpense.findMany({
        where: {
            OR: [
                { notes: { startsWith: 'AUTOFATTURA_TD17' } },
                { notes: { startsWith: 'AUTOFATTURA_TD18' } },
            ],
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
    });

    return rows.map((r) => {
        const meta = (r.metadataJson || {}) as Record<string, unknown>;
        const fromNotes = String(r.notes || '')
            .replace(/^AUTOFATTURA_TD1[78]\s+/i, '')
            .trim();
        const imponibile = Math.abs(r.netCents || r.totalCents);
        const vat =
            typeof meta.vatCentsVirtual === 'number'
                ? Math.abs(meta.vatCentsVirtual)
                : Math.abs(r.vatCents || Math.round(imponibile * 0.22));
        return {
            id: r.id,
            documentNumber: String(meta.documentNumber || fromNotes || r.id.slice(0, 8)),
            vendorName: r.vendorName,
            autofatturaDate: r.expenseDate.toISOString().slice(0, 10),
            foreignInvoiceDate:
                typeof meta.foreignInvoiceDate === 'string' ? meta.foreignInvoiceDate : null,
            foreignInvoiceNumber:
                typeof meta.foreignInvoiceNumber === 'string' ? meta.foreignInvoiceNumber : null,
            imponibileCents: imponibile,
            vatCents: vat,
            totaleCents: imponibile + vat,
            docType: String(meta.tipoDocumento || meta.autofatturaType || 'TD17'),
            reconciled: Boolean(r.reconciled),
            fileName: r.fileName,
            createdAt: r.createdAt.toISOString(),
        };
    });
}

export async function getAutofatturaXmlDownload(expenseId: string): Promise<{
    xml: string;
    fileName: string;
}> {
    const row = await prisma.manualFinanceExpense.findUnique({ where: { id: expenseId } });
    if (!row) throw new Error('Autofattura non trovata');

    const meta = (row.metadataJson || {}) as Record<string, unknown>;
    const source = String(meta.source || '');
    if (!source.startsWith('AUTOFATTURA_TD') && !String(row.notes || '').startsWith('AUTOFATTURA_TD')) {
        throw new Error('Documento non è un\'autofattura generata');
    }

    if (row.blobPath) {
        const buf = await readStoredBytes(row.blobPath, row.storageKind, row.blobUrl);
        if (buf) {
            return {
                xml: buf.toString('utf-8'),
                fileName: row.fileName || `Autofattura_${meta.documentNumber || expenseId}.xml`,
            };
        }
    }

    // Fallback: rigenera XML da metadata
    const docType: AutofatturaDocType =
        String(meta.tipoDocumento || meta.autofatturaType || 'TD17').toUpperCase() === 'TD18'
            ? 'TD18'
            : 'TD17';
    const documentNumber = String(meta.documentNumber || `REGEN-${expenseId.slice(0, 6)}`);
    const progressivoInvio = String(meta.progressivoInvio || documentNumber.replace(/[^A-Z0-9]/gi, '').slice(0, 10));
    const foreignInvoiceNumber = String(meta.foreignInvoiceNumber || 'N/D');
    const foreignInvoiceDate = String(
        meta.foreignInvoiceDate || row.expenseDate.toISOString().slice(0, 10)
    );
    const vendor = guessVendorPreset(row.vendorName);
    const generated = generateAutofatturaXml({
        docType,
        autofatturaDate: row.expenseDate.toISOString().slice(0, 10),
        foreignInvoiceNumber,
        foreignInvoiceDate,
        imponibileCents: Math.abs(row.netCents || row.totalCents),
        vendor: { ...vendor, denominazione: row.vendorName },
        documentNumber,
        progressivoInvio,
    });
    return { xml: generated.xml, fileName: generated.fileName };
}
