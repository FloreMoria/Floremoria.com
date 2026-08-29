/**
 * Ingestione massiva fatture SDI/YouDoox → manual_finance_expenses + match Fineco.
 */

import * as fs from 'fs';
import * as path from 'path';
import { del } from '@vercel/blob';
import prisma from '@/lib/prisma';
import { putBlobWithAccessFallback } from '@/lib/blob/storeAccess';
import { addAccountingEntries, upsertAccountingEntries } from '@/lib/financial/ledgerStore';
import { LEDGER_BANK_ACCOUNT } from '@/lib/financial/companyBankDetails';
import type { AccountingEntry } from '@/lib/financial/types';
import {
    parseInvoiceUpload,
    type ParsedFatturaPa,
} from '@/lib/financial/parseFatturaPaXml';
import { dedupeKeysMatch } from '@/lib/financial/invoiceDedupe';
import type { Prisma } from '@prisma/client';
import {
    FOREIGN_AUTOFATTURA_SOURCE,
    SAAS_FOREIGN_VENDOR_RE,
    bankDescriptionMatchesSaasVendor,
} from '@/lib/financial/foreignAutofattura';
import { recordInvoiceUpload } from '@/lib/financial/invoiceUploadHistory';
import { appendLedgerEntries } from '@/lib/financial/historicalLedgerSync';

const LOCAL_DIR = path.join(process.cwd(), 'data', 'sdi-invoices');
const BLOB_PREFIX = 'floremoria-finance/sdi-invoices';

export type InvoiceIngestChannel = 'SDI_XML' | 'SDI_XLSX';

export type SdiIngestSummary = {
    imported: number;
    updated: number;
    skippedDuplicates: number;
    skippedErrors: number;
    matchedFineco: number;
    creditNotes: number;
    cancelledByCreditNote: number;
    foreignAutofatture: number;
    /** Fatture passive fornitore (non autofattura). */
    passiveInvoices: number;
    /** Fatture emesse da FloreMoria (ricavi). */
    activeInvoices: number;
    /** File XML singoli elaborati (utile in ZIP multipli). */
    filesProcessed: number;
    totalCents: number;
    totalNetCents: number;
    uploadId?: string;
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
    // Preferenza: filtro JSON Prisma (Postgres) — match esatto
    try {
        const hit = await prisma.manualFinanceExpense.findFirst({
            where: {
                metadataJson: {
                    path: ['dedupeKey'],
                    equals: dedupeKey,
                },
            },
        });
        if (hit) return hit;
    } catch {
        // fallback sotto
    }

    // Legacy: P.IVA senza prefisso IT vs con IT (stesso documento da ZIP XML e report XLSX)
    const recent = await prisma.manualFinanceExpense.findMany({
        where: { docType: { in: ['FATTURA', 'NOTA_CREDITO'] } },
        orderBy: { createdAt: 'desc' },
        take: 800,
    });
    return (
        recent.find((r) => {
            const meta = r.metadataJson as { dedupeKey?: string } | null;
            if (meta?.dedupeKey && dedupeKeysMatch(meta.dedupeKey, dedupeKey)) return true;
            // notes: "SDI_XML IT…|num|date" — confronto esatto sulla chiave, non substring
            const notes = r.notes || '';
            const m = notes.match(/(?:SDI_XML|SDI_XLSX|SDI_AUTOFATTURA_ESTERA)\s+(\S+)/);
            if (m?.[1] && dedupeKeysMatch(m[1], dedupeKey)) return true;
            return false;
        }) || null
    );
}

function fingerprint(inv: {
    totalCents: number;
    netCents: number;
    vatCents: number;
    vendorName: string;
    description?: string;
    docType?: string;
}): string {
    return [
        inv.docType || 'FATTURA',
        inv.totalCents,
        inv.netCents,
        inv.vatCents,
        normalizeVendor(inv.vendorName),
        (inv.description || '').slice(0, 120),
    ].join('|');
}

function resolveMetadataSource(
    inv: ParsedFatturaPa,
    channel: InvoiceIngestChannel
): string {
    const role = inv.invoiceRole || (inv.isForeignAutofattura ? 'AUTOFATTURA' : 'PASSIVE');
    if (role === 'ACTIVE') return 'SDI_ACTIVE';
    if (role === 'AUTOFATTURA' || inv.isForeignAutofattura || inv.isReverseCharge) {
        return FOREIGN_AUTOFATTURA_SOURCE;
    }
    return channel;
}

async function findMatchingCounterparty(vendorVat: string | null) {
    if (!vendorVat) return { supplierId: null, partnerId: null, matchedCounterpartyName: null };
    const digits = vendorVat.replace(/\D/g, '');
    if (digits.length < 7) return { supplierId: null, partnerId: null, matchedCounterpartyName: null };

    try {
        const supplier = await prisma.supplier.findFirst({
            where: {
                deletedAt: null,
                vatNumber: { contains: digits },
            },
            select: { id: true, companyName: true },
        });
        if (supplier) {
            return { supplierId: supplier.id, partnerId: null, matchedCounterpartyName: supplier.companyName };
        }

        const partner = await prisma.partner.findFirst({
            where: {
                deletedAt: null,
                vatNumber: { contains: digits },
            },
            select: { id: true, shopName: true },
        });
        if (partner) {
            return { supplierId: null, partnerId: partner.id, matchedCounterpartyName: partner.shopName };
        }
    } catch {
        /* best-effort fallback */
    }

    return { supplierId: null, partnerId: null, matchedCounterpartyName: null };
}

function buildInvoiceMetadata(
    inv: ParsedFatturaPa,
    archive: { blobPath: string | null; blobUrl: string | null; storageKind: string; fileName: string },
    channel: InvoiceIngestChannel,
    extra?: Record<string, unknown>
): Prisma.InputJsonValue {
    const role = inv.invoiceRole || (inv.isForeignAutofattura ? 'AUTOFATTURA' : 'PASSIVE');
    const source =
        role === 'ACTIVE'
            ? 'SDI_ACTIVE'
            : role === 'AUTOFATTURA'
              ? FOREIGN_AUTOFATTURA_SOURCE
              : channel;
    const isForeign = source === FOREIGN_AUTOFATTURA_SOURCE;
    return {
        source,
        ingestChannel: channel,
        invoiceRole: role,
        isDeductible: role !== 'ACTIVE' && inv.docKind !== 'NOTA_CREDITO',
        isRevenue: role === 'ACTIVE',
        isReverseCharge: Boolean(inv.isReverseCharge || isForeign),
        isForeignAutofattura: Boolean(inv.isForeignAutofattura || isForeign),
        category: isForeign
            ? inv.foreignCategory || 'Software & Servizi SaaS Estero'
            : role === 'ACTIVE'
              ? 'Ricavi vendite / Fatture attive'
              : null,
        tipoDocumento: inv.tipoDocumento || null,
        autofatturaType: inv.autofatturaType || null,
        dedupeKey: inv.dedupeKey,
        vendorVat: inv.vendorVat,
        cedenteVat: inv.cedenteVat || inv.vendorVat,
        cessionarioVat: inv.cessionarioVat || null,
        invoiceNumber: inv.invoiceNumber,
        docKind: inv.docKind,
        relatedInvoiceNumber: inv.relatedInvoiceNumber || null,
        lineDescriptions: inv.lineDescriptions,
        sourceFileName: inv.sourceFileName,
        archiveFileName: archive.fileName,
        ...(extra || {}),
    };
}

function toLedgerEntry(
    rowId: string,
    inv: ParsedFatturaPa,
    channel: InvoiceIngestChannel
): AccountingEntry {
    const isNc = inv.docKind === 'NOTA_CREDITO';
    const isForeign = Boolean(inv.isForeignAutofattura || inv.isReverseCharge);
    const sourceLabel = isForeign
        ? 'autofattura estera'
        : channel === 'SDI_XLSX'
          ? 'report'
          : 'SDI';
    return {
        id: `entry_sdi_${rowId}`,
        date: inv.invoiceDate,
        description: `${isNc ? 'Nota credito' : isForeign ? 'Autofattura estera' : 'Fattura'} ${sourceLabel} ${inv.vendorName} n. ${inv.invoiceNumber}`.slice(
            0,
            240
        ),
        dareAccount: isNc
            ? LEDGER_BANK_ACCOUNT
            : isForeign
              ? '70300 - Software / SaaS Esteri (Reverse Charge)'
              : '70900 - Spese Generali / Fatture Passive',
        avereAccount: isNc
            ? isForeign
                ? '70300 - Software / SaaS Esteri (Reverse Charge)'
                : '70900 - Spese Generali / Fatture Passive'
            : LEDGER_BANK_ACCOUNT,
        amountCents: Math.abs(inv.totalCents),
        vatAmountCents: isForeign ? 0 : Math.abs(inv.vatCents),
        isForeignService: isForeign,
        invoiceReference: inv.invoiceNumber,
        status: 'CONFIRMED',
    };
}

/**
 * Se arriva una NC con fattura collegata, marca la fattura originale come stornata.
 */
async function markRelatedInvoiceCancelledByCreditNote(inv: ParsedFatturaPa): Promise<number> {
    if (inv.docKind !== 'NOTA_CREDITO' || !inv.relatedInvoiceNumber || !inv.vendorVat) {
        return 0;
    }
    const vat = inv.vendorVat.replace(/\s+/g, '').toUpperCase();
    const relatedNum = inv.relatedInvoiceNumber.replace(/\s+/g, '').toUpperCase();
    const candidates = await prisma.manualFinanceExpense.findMany({
        where: {
            docType: 'FATTURA',
            vendorName: { contains: inv.vendorName.slice(0, 40), mode: 'insensitive' },
        },
        orderBy: { expenseDate: 'desc' },
        take: 40,
    });
    let cancelled = 0;
    for (const row of candidates) {
        const meta = (row.metadataJson || {}) as Record<string, unknown>;
        const invNo = String(meta.invoiceNumber || row.notes || '')
            .replace(/\s+/g, '')
            .toUpperCase();
        const invVat = String(meta.vendorVat || '')
            .replace(/\s+/g, '')
            .toUpperCase();
        if (!invNo.includes(relatedNum) && invNo !== relatedNum) continue;
        if (invVat && vat && !invVat.includes(vat.slice(-11)) && !vat.includes(invVat.slice(-11))) {
            continue;
        }
        if (meta.cancelledByCreditNote) continue;
        await prisma.manualFinanceExpense.update({
            where: { id: row.id },
            data: {
                notes: `${row.notes || ''} | STORNATA da NC ${inv.invoiceNumber}`.slice(0, 500),
                metadataJson: {
                    ...meta,
                    cancelledByCreditNote: true,
                    cancelledByInvoiceNumber: inv.invoiceNumber,
                    cancelledAt: new Date().toISOString(),
                    isDeductible: false,
                } as Prisma.InputJsonValue,
            },
        });
        cancelled += 1;
    }
    return cancelled;
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
                matchNotes: `Scollegato: fattura ${expenseId} aggiornata`,
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
    } catch {
        /* best-effort */
    }
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

/** Riconcilia spesa manuale / autofattura con uscita Fineco (importo + vendor / SaaS). */
export async function reconcileInvoiceWithFineco(expense: {
    id: string;
    vendorName: string;
    totalCents: number;
    expenseDate: Date;
    vendorVat?: string | null;
    isForeignAutofattura?: boolean;
}): Promise<boolean> {
    const abs = Math.abs(expense.totalCents);
    const from = new Date(expense.expenseDate.getTime() - 45 * 24 * 60 * 60 * 1000);
    const to = new Date(expense.expenseDate.getTime() + 20 * 24 * 60 * 60 * 1000);
    const vatDigits = (expense.vendorVat || '').replace(/\D/g, '');
    // SaaS: tolleranza ±€2 su FX/carta
    const amountFilter = expense.isForeignAutofattura
        ? { gte: -(abs + 200), lte: -(Math.max(1, abs - 200)) }
        : { in: [-abs, abs] as number[] };

    const candidates = await prisma.bankStatementLine.findMany({
        where: {
            matchStatus: { not: 'MATCHED' },
            amountCents: amountFilter,
            OR: [
                { accountingDate: { gte: from, lte: to } },
                { valueDate: { gte: from, lte: to } },
                { accountingDate: null, valueDate: null },
            ],
        },
        orderBy: { accountingDate: 'desc' },
        take: 60,
    });

    const hit = candidates.find((c) => {
        if (c.amountCents >= 0) return false;
        if (vendorCompatible(expense.vendorName, c.description)) return true;
        if (vatDigits.length >= 8 && c.description.replace(/\D/g, '').includes(vatDigits)) {
            return true;
        }
        if (
            expense.isForeignAutofattura &&
            (SAAS_FOREIGN_VENDOR_RE.test(c.description) ||
                bankDescriptionMatchesSaasVendor(c.description, expense.vendorName))
        ) {
            return Math.abs(Math.abs(c.amountCents) - abs) <= 200;
        }
        return false;
    });
    if (!hit) return false;

    const matchType = expense.isForeignAutofattura ? 'FOREIGN_AUTOFATTURA' : 'SDI_INVOICE';
    await prisma.$transaction([
        prisma.bankStatementLine.update({
            where: { id: hit.id },
            data: {
                matchStatus: 'MATCHED',
                matchType,
                matchScore: expense.isForeignAutofattura ? 92 : 94,
                matchedTxId: expense.id,
                matchNotes: `Riconciliato — ${
                    expense.isForeignAutofattura ? 'autofattura estera' : 'fattura'
                } ${expense.vendorName} (€${(abs / 100).toFixed(2)})`,
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
    channel: InvoiceIngestChannel,
    uploadId?: string
) {
    const expenseDate = new Date(`${inv.invoiceDate}T12:00:00.000Z`);
    const metaSource = resolveMetadataSource(inv, channel);
    const role = inv.invoiceRole || (inv.isForeignAutofattura ? 'AUTOFATTURA' : 'PASSIVE');
    const contentType =
        channel === 'SDI_XLSX'
            ? archive.fileName.toLowerCase().endsWith('.csv')
                ? 'text/csv'
                : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'application/xml';

    // Attive: importi positivi (ricavo). Passive/autofattura: mantieni segno dal parser.
    let totalCents = inv.totalCents;
    let netCents = inv.isReverseCharge ? inv.totalCents : inv.netCents;
    let vatCents = inv.isReverseCharge ? 0 : inv.vatCents;
    if (role === 'ACTIVE') {
        totalCents = Math.abs(inv.totalCents);
        netCents = Math.abs(inv.netCents || inv.totalCents);
        vatCents = Math.abs(inv.vatCents);
    }

    const counterpartyMatch = await findMatchingCounterparty(inv.vendorVat);

    const row = await prisma.manualFinanceExpense.create({
        data: {
            expenseDate,
            docType: inv.docKind,
            vendorName: counterpartyMatch.matchedCounterpartyName || inv.vendorName,
            description:
                inv.causale ||
                `${
                    role === 'ACTIVE'
                        ? 'Fattura attiva'
                        : inv.isForeignAutofattura
                          ? `Autofattura ${inv.autofatturaType || 'TD17'}`
                          : inv.docKind === 'NOTA_CREDITO'
                            ? 'Nota di credito'
                            : 'Fattura'
                } n. ${inv.invoiceNumber}`,
            totalCents,
            vatRate: inv.vatRate,
            vatCents,
            netCents,
            fileName: archive.fileName,
            contentType,
            sizeBytes: null,
            blobPath: archive.blobPath,
            blobUrl: archive.blobUrl,
            storageKind: archive.storageKind,
            periodKey: periodKeyFromDate(expenseDate),
            notes: `${metaSource} ${inv.dedupeKey}`,
            metadataJson: buildInvoiceMetadata(inv, archive, channel, {
                uploadId: uploadId || null,
                ...counterpartyMatch,
            }),
            reconciled: false,
        },
    });

    addAccountingEntries([toLedgerEntry(row.id, inv, channel)]);

    if (role === 'ACTIVE') {
        try {
            await appendLedgerEntries([
                {
                    sourceKey: `SDI_ACTIVE:${inv.dedupeKey}`.slice(0, 180),
                    sourceType: 'MANUAL_EXPENSE',
                    sourceId: row.id,
                    direction: 'ENTRATA',
                    category: 'RICAVI_VENDITE',
                    accountingDate: expenseDate,
                    description: row.description,
                    counterpartyName: inv.vendorName,
                    counterpartyVat: inv.cessionarioVat || inv.vendorVat,
                    netCents: Math.abs(netCents),
                    vatRate: inv.vatRate,
                    vatCents: Math.abs(vatCents),
                    totalCents: Math.abs(totalCents),
                    reconciliationStatus: 'UNMATCHED',
                    documentRef: inv.invoiceNumber,
                    attachmentUrl: archive.blobUrl,
                    attachmentPath: archive.blobPath,
                    metadataJson: {
                        source: 'SDI_ACTIVE',
                        dedupeKey: inv.dedupeKey,
                        uploadId: uploadId || null,
                    },
                },
            ]);
        } catch (err) {
            console.warn('[ingest] active ledger', err);
        }
    }

    return row;
}

/**
 * Aggiorna fattura già presente (stessa chiave) con dati nuovi dal report completo / NC corretta.
 */
async function updateExistingInvoice(
    existing: {
        id: string;
        totalCents: number;
        netCents: number;
        vatCents: number;
        vendorName: string;
        description: string;
        docType: string;
        reconciled: boolean;
        matchedStatementLineId: string | null;
        metadataJson: Prisma.JsonValue | null;
        notes: string | null;
    },
    inv: ParsedFatturaPa,
    archive: { blobPath: string | null; blobUrl: string | null; storageKind: string; fileName: string },
    channel: InvoiceIngestChannel
) {
    const amountChanged = existing.totalCents !== inv.totalCents;
    if (amountChanged && existing.matchedStatementLineId) {
        await unlinkFinecoMatch(existing.id, existing.matchedStatementLineId);
    }

    const prevMeta = (existing.metadataJson || {}) as Record<string, unknown>;
    const expenseDate = new Date(`${inv.invoiceDate}T12:00:00.000Z`);
    const metaSource = resolveMetadataSource(inv, channel);
    const row = await prisma.manualFinanceExpense.update({
        where: { id: existing.id },
        data: {
            expenseDate,
            docType: inv.docKind,
            vendorName: inv.vendorName,
            description: inv.causale || existing.description,
            totalCents: inv.totalCents,
            vatRate: inv.vatRate,
            vatCents: inv.isReverseCharge ? 0 : inv.vatCents,
            netCents: inv.isReverseCharge ? inv.totalCents : inv.netCents,
            fileName: archive.fileName || undefined,
            blobPath: archive.blobPath || undefined,
            blobUrl: archive.blobUrl || undefined,
            storageKind: archive.storageKind !== 'none' ? archive.storageKind : undefined,
            periodKey: periodKeyFromDate(expenseDate),
            notes: `${metaSource} ${inv.dedupeKey} | aggiornata ${new Date().toISOString().slice(0, 10)}`,
            metadataJson: buildInvoiceMetadata(inv, archive, channel, {
                previousTotalCents: existing.totalCents,
                updatedFromImport: true,
                updatedAt: new Date().toISOString(),
                cancelledByCreditNote: prevMeta.cancelledByCreditNote || false,
            }),
            reconciled: amountChanged ? false : existing.reconciled,
            matchedStatementLineId: amountChanged ? null : existing.matchedStatementLineId,
        },
    });

    upsertAccountingEntries([toLedgerEntry(row.id, inv, channel)]);
    return { row, amountChanged };
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
    let updated = 0;
    let skippedDuplicates = 0;
    let matchedFineco = 0;
    let creditNotes = 0;
    let cancelledByCreditNote = 0;
    let foreignAutofatture = 0;
    let passiveInvoices = 0;
    let activeInvoices = 0;
    let totalCents = 0;
    let totalNetCents = 0;
    const sampleVendors: string[] = [];
    const seenInBatch = new Set<string>();
    const uploadId = `upl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const sourceFiles = new Set(input.invoices.map((i) => i.sourceFileName).filter(Boolean));

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
            const role =
                inv.invoiceRole ||
                (inv.isForeignAutofattura || inv.isReverseCharge ? 'AUTOFATTURA' : 'PASSIVE');
            if (inv.docKind === 'NOTA_CREDITO') creditNotes += 1;
            if (role === 'AUTOFATTURA') foreignAutofatture += 1;
            else if (role === 'ACTIVE') activeInvoices += 1;
            else passiveInvoices += 1;

            // Dedup interno al file (stessa fattura ripetuta nel report)
            const alreadyInBatch = [...seenInBatch].some((k) => dedupeKeysMatch(k, inv.dedupeKey));
            if (alreadyInBatch) {
                skippedDuplicates += 1;
                skippedDetails.push({
                    fileName: inv.sourceFileName,
                    reason: `Duplicato nel file ${inv.dedupeKey}`,
                });
                continue;
            }

            const existing = await findExistingByDedupeKey(inv.dedupeKey);
            if (existing) {
                const same =
                    fingerprint({
                        totalCents: existing.totalCents,
                        netCents: existing.netCents,
                        vatCents: existing.vatCents,
                        vendorName: existing.vendorName,
                        description: existing.description,
                        docType: existing.docType,
                    }) ===
                    fingerprint({
                        totalCents: inv.totalCents,
                        netCents: inv.netCents,
                        vatCents: inv.vatCents,
                        vendorName: inv.vendorName,
                        description: inv.causale,
                        docType: inv.docKind,
                    });

                if (same) {
                    skippedDuplicates += 1;
                    seenInBatch.add(inv.dedupeKey);
                    skippedDetails.push({
                        fileName: inv.sourceFileName,
                        reason: `Già presente ${inv.dedupeKey}`,
                    });
                    continue;
                }

                const { row, amountChanged } = await updateExistingInvoice(
                    existing,
                    inv,
                    archive,
                    input.source
                );
                updated += 1;
                totalCents += inv.totalCents;
                totalNetCents += Math.abs(inv.netCents || inv.totalCents);
                if (sampleVendors.length < 8 && !sampleVendors.includes(inv.vendorName)) {
                    sampleVendors.push(inv.vendorName);
                }
                warnings.push(
                    `Aggiornata ${inv.dedupeKey}: ${existing.totalCents / 100} € → ${inv.totalCents / 100} €`
                );

                cancelledByCreditNote += await markRelatedInvoiceCancelledByCreditNote(inv);

                if (
                    role !== 'ACTIVE' &&
                    inv.docKind !== 'NOTA_CREDITO' &&
                    (!row.reconciled || amountChanged)
                ) {
                    const matched = await reconcileInvoiceWithFineco({
                        id: row.id,
                        vendorName: inv.vendorName,
                        totalCents: inv.totalCents,
                        expenseDate: row.expenseDate,
                        vendorVat: inv.vendorVat,
                        isForeignAutofattura: Boolean(inv.isForeignAutofattura || inv.isReverseCharge),
                    });
                    if (matched) matchedFineco += 1;
                }
                seenInBatch.add(inv.dedupeKey);
                continue;
            }

            const row = await persistInvoice(inv, archive, input.source, uploadId);
            imported += 1;
            seenInBatch.add(inv.dedupeKey);
            totalCents += inv.totalCents;
            totalNetCents += Math.abs(inv.netCents || inv.totalCents);
            if (sampleVendors.length < 8 && !sampleVendors.includes(inv.vendorName)) {
                sampleVendors.push(inv.vendorName);
            }

            cancelledByCreditNote += await markRelatedInvoiceCancelledByCreditNote(inv);

            if (role !== 'ACTIVE' && inv.docKind !== 'NOTA_CREDITO') {
                const matched = await reconcileInvoiceWithFineco({
                    id: row.id,
                    vendorName: inv.vendorName,
                    totalCents: inv.totalCents,
                    expenseDate: row.expenseDate,
                    vendorVat: inv.vendorVat,
                    isForeignAutofattura: Boolean(inv.isForeignAutofattura || inv.isReverseCharge),
                });
                if (matched) matchedFineco += 1;
            }
        } catch (err) {
            skippedDetails.push({
                fileName: inv.sourceFileName,
                reason: err instanceof Error ? err.message : String(err),
            });
        }
    }

    if (imported === 0 && updated === 0 && archive.storageKind === 'blob' && (archive.blobUrl || archive.blobPath)) {
        const token = getBlobToken();
        if (token) {
            try {
                await del(archive.blobUrl || archive.blobPath!, { token });
            } catch {
                /* ignore */
            }
        }
    }

    let recordedUploadId = uploadId;
    try {
        const recorded = await recordInvoiceUpload({
            id: uploadId,
            channel: input.source,
            fileName: input.fileName,
            sizeBytes: input.buffer.byteLength,
            invoiceCount: input.invoices.length,
            imported,
            updated,
            skippedDuplicates,
            totalNetCents,
            passiveCount: passiveInvoices,
            foreignCount: foreignAutofatture,
            activeCount: activeInvoices,
            filesProcessed: Math.max(1, sourceFiles.size),
        });
        recordedUploadId = recorded.id;
    } catch (err) {
        console.warn('[ingest] upload history', err);
    }

    return {
        imported,
        updated,
        skippedDuplicates,
        skippedErrors: Math.max(0, skippedDetails.length - skippedDuplicates),
        matchedFineco,
        creditNotes,
        cancelledByCreditNote,
        foreignAutofatture,
        passiveInvoices,
        activeInvoices,
        filesProcessed: Math.max(1, sourceFiles.size),
        totalCents,
        totalNetCents,
        uploadId: recordedUploadId,
        warnings: warnings.slice(0, 40),
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
