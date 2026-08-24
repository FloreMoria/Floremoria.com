/**
 * Listing, PDF, riscarica XML ed eliminazione autofatture TD17/TD18 generate.
 */

import * as fs from 'fs';
import * as path from 'path';
import { del } from '@vercel/blob';
import prisma from '@/lib/prisma';
import { getBlobWithAccessFallback } from '@/lib/blob/storeAccess';
import {
    AUTOFATTURA_VENDOR_PRESETS,
    generateAutofatturaXml,
    type AutofatturaDocType,
    type ForeignVendorPreset,
} from '@/lib/financial/generateAutofatturaXml';
import {
    generateAutofatturaPdf,
    type AutofatturaPdfInput,
} from '@/lib/financial/generateAutofatturaPdf';

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

function assertIsGeneratedAutofattura(row: {
    notes: string | null;
    metadataJson: unknown;
}): Record<string, unknown> {
    const meta = (row.metadataJson || {}) as Record<string, unknown>;
    const source = String(meta.source || '');
    if (!source.startsWith('AUTOFATTURA_TD') && !String(row.notes || '').startsWith('AUTOFATTURA_TD')) {
        throw new Error("Documento non e' un'autofattura generata");
    }
    return meta;
}

function vendorFromMeta(meta: Record<string, unknown>, vendorName: string): ForeignVendorPreset {
    const presetId = typeof meta.vendorId === 'string' ? meta.vendorId : '';
    const fromId = AUTOFATTURA_VENDOR_PRESETS.find((p) => p.id === presetId);
    const base = fromId || guessVendorPreset(vendorName);
    return {
        ...base,
        denominazione:
            typeof meta.vendorDenominazione === 'string'
                ? meta.vendorDenominazione
                : vendorName || base.denominazione,
        idPaese: typeof meta.vendorIdPaese === 'string' ? meta.vendorIdPaese : base.idPaese,
        idCodice: typeof meta.vendorIdCodice === 'string' ? meta.vendorIdCodice : base.idCodice,
        indirizzo: typeof meta.vendorIndirizzo === 'string' ? meta.vendorIndirizzo : base.indirizzo,
        cap: typeof meta.vendorCap === 'string' ? meta.vendorCap : base.cap,
        comune: typeof meta.vendorComune === 'string' ? meta.vendorComune : base.comune,
        nazione: typeof meta.vendorNazione === 'string' ? meta.vendorNazione : base.nazione,
    };
}

function buildPdfInputFromRow(row: {
    id: string;
    vendorName: string;
    expenseDate: Date;
    netCents: number;
    totalCents: number;
    vatCents: number;
    notes: string | null;
    metadataJson: unknown;
}): AutofatturaPdfInput {
    const meta = assertIsGeneratedAutofattura(row);
    const fromNotes = String(row.notes || '')
        .replace(/^AUTOFATTURA_TD1[78]\s+/i, '')
        .trim();
    const docType: AutofatturaDocType =
        String(meta.tipoDocumento || meta.autofatturaType || 'TD17').toUpperCase() === 'TD18'
            ? 'TD18'
            : 'TD17';
    const imponibile = Math.abs(row.netCents || row.totalCents);
    const vat =
        typeof meta.vatCentsVirtual === 'number'
            ? Math.abs(meta.vatCentsVirtual)
            : Math.abs(row.vatCents || Math.round((imponibile * 22) / 100));
    const vendor = vendorFromMeta(meta, row.vendorName);
    return {
        docType,
        documentNumber: String(meta.documentNumber || fromNotes || row.id.slice(0, 8)),
        autofatturaDate: row.expenseDate.toISOString().slice(0, 10),
        foreignInvoiceNumber: String(meta.foreignInvoiceNumber || 'N/D'),
        foreignInvoiceDate: String(
            meta.foreignInvoiceDate || row.expenseDate.toISOString().slice(0, 10)
        ),
        imponibileCents: imponibile,
        vatCents: vat,
        totaleCents:
            typeof meta.totaleDocumentoCents === 'number'
                ? Math.abs(meta.totaleDocumentoCents)
                : imponibile + vat,
        descrizioneLinea: String(meta.descrizioneLinea || vendor.defaultDescrizione || 'SERVIZI'),
        vendor,
    };
}

export async function listGeneratedAutofatture(): Promise<AutofatturaHistoryItem[]> {
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
                : Math.abs(r.vatCents || Math.round((imponibile * 22) / 100));
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
    const meta = assertIsGeneratedAutofattura(row);

    if (row.blobPath) {
        const buf = await readStoredBytes(row.blobPath, row.storageKind, row.blobUrl);
        if (buf) {
            return {
                xml: buf.toString('utf-8'),
                fileName: row.fileName || `Autofattura_${meta.documentNumber || expenseId}.xml`,
            };
        }
    }

    const pdfInput = buildPdfInputFromRow(row);
    const progressivoInvio = String(
        meta.progressivoInvio ||
            pdfInput.documentNumber.replace(/[^A-Z0-9]/gi, '').slice(0, 10)
    );
    const vendor = vendorFromMeta(meta, row.vendorName);
    const generated = generateAutofatturaXml({
        docType: pdfInput.docType,
        autofatturaDate: pdfInput.autofatturaDate,
        foreignInvoiceNumber: pdfInput.foreignInvoiceNumber,
        foreignInvoiceDate: pdfInput.foreignInvoiceDate,
        imponibileCents: pdfInput.imponibileCents,
        vendor,
        descrizioneLinea: pdfInput.descrizioneLinea,
        documentNumber: pdfInput.documentNumber,
        progressivoInvio,
    });
    return { xml: generated.xml, fileName: generated.fileName };
}

export async function getAutofatturaPdfDownload(expenseId: string): Promise<{
    bytes: Uint8Array;
    fileName: string;
}> {
    const row = await prisma.manualFinanceExpense.findUnique({ where: { id: expenseId } });
    if (!row) throw new Error('Autofattura non trovata');
    const input = buildPdfInputFromRow(row);
    return generateAutofatturaPdf(input);
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
                matchNotes: `Scollegato: autofattura ${expenseId} eliminata`,
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
        console.warn('[autofatture] unlink fineco', err);
    }
}

export async function deleteGeneratedAutofattura(expenseId: string): Promise<void> {
    const row = await prisma.manualFinanceExpense.findUnique({ where: { id: expenseId } });
    if (!row) throw new Error('Autofattura non trovata');
    assertIsGeneratedAutofattura(row);

    await unlinkFinecoMatch(expenseId, row.matchedStatementLineId);

    try {
        await prisma.financialLedgerEntry.updateMany({
            where: {
                OR: [
                    { sourceKey: `AUTOFATTURA_GEN:${expenseId}` },
                    { sourceKey: `MANUAL_EXPENSE:${expenseId}` },
                    { sourceId: expenseId, sourceType: 'MANUAL_EXPENSE' },
                ],
                reversedAt: null,
            },
            data: { reversedAt: new Date() },
        });
    } catch (err) {
        console.warn('[autofatture] reverse ledger', err);
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
            } catch (err) {
                console.warn('[autofatture] delete blob', err);
            }
        }
    }

    await prisma.manualFinanceExpense.delete({ where: { id: expenseId } });
}
