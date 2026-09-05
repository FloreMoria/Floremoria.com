/**
 * Listing, PDF, riscarica XML ed eliminazione autofatture TD17/TD18 generate
 * e upload PDF/immagine estere (SDI_AUTOFATTURA_ESTERA).
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
import { FOREIGN_AUTOFATTURA_SOURCE } from '@/lib/financial/foreignAutofattura';

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
    /** generated = XML FloreMoria; upload = PDF/immagine fornitore */
    origin: 'generated' | 'upload';
};

/** Filtro Prisma condiviso: storico UI + rif. dossier. */
export function foreignAutofatturaExpenseWhere() {
    return {
        OR: [
            { notes: { startsWith: 'AUTOFATTURA_TD17' } },
            { notes: { startsWith: 'AUTOFATTURA_TD18' } },
            { notes: { startsWith: 'AUTOFATTURA_TD19' } },
            { notes: { startsWith: FOREIGN_AUTOFATTURA_SOURCE } },
            { metadataJson: { path: ['isForeignAutofattura'], equals: true } },
            { metadataJson: { path: ['source'], equals: FOREIGN_AUTOFATTURA_SOURCE } },
            { metadataJson: { path: ['source'], equals: 'AUTOFATTURA_TD17' } },
            { metadataJson: { path: ['source'], equals: 'AUTOFATTURA_TD18' } },
            { metadataJson: { path: ['source'], equals: 'AUTOFATTURA_TD19' } },
        ],
    };
}

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

function readMeta(metadataJson: unknown): Record<string, unknown> {
    return (metadataJson && typeof metadataJson === 'object'
        ? metadataJson
        : {}) as Record<string, unknown>;
}

/** Accetta autofatture generate (AUTOFATTURA_TD*) e upload PDF/SDI estere. */
function assertIsForeignAutofattura(row: {
    notes: string | null;
    metadataJson: unknown;
}): Record<string, unknown> {
    const meta = readMeta(row.metadataJson);
    const source = String(meta.source || '');
    const notes = String(row.notes || '');
    const ok =
        source.startsWith('AUTOFATTURA_TD') ||
        source === FOREIGN_AUTOFATTURA_SOURCE ||
        meta.isForeignAutofattura === true ||
        notes.startsWith('AUTOFATTURA_TD') ||
        notes.startsWith(FOREIGN_AUTOFATTURA_SOURCE);
    if (!ok) {
        throw new Error("Documento non e' un'autofattura estera");
    }
    return meta;
}

function isBinaryUploadAttachment(row: {
    contentType: string | null;
    fileName: string | null;
    notes: string | null;
}): boolean {
    const ct = String(row.contentType || '').toLowerCase();
    const name = String(row.fileName || '').toLowerCase();
    const notes = String(row.notes || '');
    if (ct.includes('pdf') || ct.startsWith('image/')) return true;
    if (/\.(pdf|png|jpe?g|webp)$/i.test(name)) return true;
    if (notes.startsWith(`${FOREIGN_AUTOFATTURA_SOURCE} PDF`)) return true;
    return false;
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

function resolveDocType(meta: Record<string, unknown>, notes: string | null): AutofatturaDocType {
    const raw = String(meta.tipoDocumento || meta.autofatturaType || notes || 'TD17').toUpperCase();
    if (raw.includes('TD18')) return 'TD18';
    return 'TD17';
}

function buildPdfInputFromRow(row: {
    id: string;
    vendorName: string;
    expenseDate: Date;
    netCents: number;
    totalCents: number;
    vatCents: number;
    notes: string | null;
    fileName: string | null;
    metadataJson: unknown;
}): AutofatturaPdfInput {
    const meta = assertIsForeignAutofattura(row);
    const fromNotes = String(row.notes || '')
        .replace(/^AUTOFATTURA_TD1[789]\s+/i, '')
        .replace(/^SDI_AUTOFATTURA_ESTERA\s+/i, '')
        .trim();
    const docType = resolveDocType(meta, row.notes);
    const imponibile = Math.abs(row.netCents || row.totalCents);
    const vat =
        typeof meta.vatCentsVirtual === 'number'
            ? Math.abs(meta.vatCentsVirtual)
            : Math.abs(row.vatCents || Math.round((imponibile * 22) / 100));
    const vendor = vendorFromMeta(meta, row.vendorName);
    const day = row.expenseDate.toISOString().slice(0, 10);
    return {
        docType,
        documentNumber: String(
            meta.documentNumber || row.fileName || fromNotes || row.id.slice(0, 8),
        ),
        autofatturaDate: day,
        foreignInvoiceNumber: String(meta.foreignInvoiceNumber || 'N/D'),
        foreignInvoiceDate: String(meta.foreignInvoiceDate || day),
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

function mapHistoryItem(r: {
    id: string;
    vendorName: string;
    expenseDate: Date;
    netCents: number;
    totalCents: number;
    vatCents: number;
    notes: string | null;
    fileName: string | null;
    contentType: string | null;
    reconciled: boolean;
    createdAt: Date;
    metadataJson: unknown;
}): AutofatturaHistoryItem {
    const meta = readMeta(r.metadataJson);
    const fromNotes = String(r.notes || '')
        .replace(/^AUTOFATTURA_TD1[789]\s+/i, '')
        .replace(/^SDI_AUTOFATTURA_ESTERA\s+(PDF\s+)?/i, '')
        .trim();
    const imponibile = Math.abs(r.netCents || r.totalCents);
    const vat =
        typeof meta.vatCentsVirtual === 'number'
            ? Math.abs(meta.vatCentsVirtual)
            : Math.abs(r.vatCents || Math.round((imponibile * 22) / 100));
    const origin: 'generated' | 'upload' = isBinaryUploadAttachment(r)
        ? 'upload'
        : String(meta.source || '').startsWith('AUTOFATTURA_TD')
          ? 'generated'
          : 'upload';
    return {
        id: r.id,
        documentNumber: String(
            meta.documentNumber || r.fileName || fromNotes || r.id.slice(0, 8),
        ),
        vendorName: r.vendorName,
        autofatturaDate: r.expenseDate.toISOString().slice(0, 10),
        foreignInvoiceDate:
            typeof meta.foreignInvoiceDate === 'string' ? meta.foreignInvoiceDate : null,
        foreignInvoiceNumber:
            typeof meta.foreignInvoiceNumber === 'string' ? meta.foreignInvoiceNumber : null,
        imponibileCents: imponibile,
        vatCents: vat,
        totaleCents: imponibile + vat,
        docType: String(meta.tipoDocumento || meta.autofatturaType || resolveDocType(meta, r.notes)),
        reconciled: Boolean(r.reconciled),
        fileName: r.fileName,
        createdAt: r.createdAt.toISOString(),
        origin,
    };
}

export async function listGeneratedAutofatture(opts?: {
    year?: number;
    periodKey?: 'T1' | 'T2' | 'T3' | 'T4' | 'YEAR';
}): Promise<AutofatturaHistoryItem[]> {
    const year = opts?.year && opts.year >= 2020 && opts.year <= 2100 ? opts.year : null;
    const periodKey = opts?.periodKey || null;

    let dateFilter: { gte: Date; lte: Date } | undefined;
    if (year) {
        const { periodBounds } = await import('@/lib/financial/primaNotaShared');
        const key = periodKey || 'YEAR';
        const bounds = periodBounds(year, key);
        dateFilter = {
            gte: new Date(`${bounds.start}T00:00:00.000Z`),
            lte: new Date(`${bounds.end}T23:59:59.999Z`),
        };
    }

    const rows = await prisma.manualFinanceExpense.findMany({
        where: {
            AND: [
                foreignAutofatturaExpenseWhere(),
                ...(dateFilter ? [{ expenseDate: dateFilter }] : []),
            ],
        },
        orderBy: { expenseDate: 'desc' },
        take: 1000,
    });

    return rows.map(mapHistoryItem);
}

export async function getAutofatturaXmlDownload(expenseId: string): Promise<{
    xml: string;
    fileName: string;
}> {
    const row = await prisma.manualFinanceExpense.findUnique({ where: { id: expenseId } });
    if (!row) throw new Error('Autofattura non trovata');
    const meta = assertIsForeignAutofattura(row);

    if (row.blobPath && !isBinaryUploadAttachment(row)) {
        const buf = await readStoredBytes(row.blobPath, row.storageKind, row.blobUrl);
        if (buf) {
            const text = buf.toString('utf-8');
            if (text.trimStart().startsWith('<') || /FatturaElettronica/i.test(text)) {
                return {
                    xml: text,
                    fileName: row.fileName || `Autofattura_${meta.documentNumber || expenseId}.xml`,
                };
            }
        }
    }

    const pdfInput = buildPdfInputFromRow(row);
    const progressivoInvio = String(
        meta.progressivoInvio ||
            pdfInput.documentNumber.replace(/[^A-Z0-9]/gi, '').slice(0, 10),
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
    assertIsForeignAutofattura(row);

    if (row.blobPath && isBinaryUploadAttachment(row)) {
        const buf = await readStoredBytes(row.blobPath, row.storageKind, row.blobUrl);
        if (buf) {
            return {
                bytes: new Uint8Array(buf),
                fileName: row.fileName || `autofattura_${expenseId}.pdf`,
            };
        }
    }

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
    const meta = assertIsForeignAutofattura(row);

    await unlinkFinecoMatch(expenseId, row.matchedStatementLineId);

    try {
        await prisma.financialLedgerEntry.updateMany({
            where: {
                OR: [
                    { sourceKey: `AUTOFATTURA_GEN:${expenseId}` },
                    { sourceKey: `FOREIGN_AUTOFATTURA:${expenseId}` },
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

    const saasId =
        typeof meta.saasForeignInvoiceId === 'string' ? meta.saasForeignInvoiceId : null;
    if (saasId) {
        try {
            await prisma.saasForeignInvoice.delete({ where: { id: saasId } });
        } catch (err) {
            console.warn('[autofatture] delete saas twin', err);
        }
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
