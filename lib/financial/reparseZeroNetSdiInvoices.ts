/**
 * Re-parsing imponibili da XML archiviati quando netCents risulta 0 o null (bug parser legacy).
 */
import * as fs from 'fs';
import prisma from '@/lib/prisma';
import { upsertAccountingEntries } from '@/lib/financial/ledgerStore';
import { parseFatturaPaXml } from '@/lib/financial/parseFatturaPaXml';
import { toLedgerEntry } from '@/lib/financial/ingestSdiInvoices';

export type ReparseZeroNetResult = {
    scanned: number;
    updated: number;
    skipped: number;
    errors: string[];
};

async function loadXmlBuffer(row: {
    blobUrl: string | null;
    blobPath: string | null;
    storageKind: string;
    fileName: string | null;
}): Promise<Buffer | null> {
    if (row.blobUrl?.startsWith('http')) {
        const res = await fetch(row.blobUrl);
        if (!res.ok) return null;
        return Buffer.from(await res.arrayBuffer());
    }
    if (row.storageKind === 'local' && row.blobPath && fs.existsSync(row.blobPath)) {
        return fs.readFileSync(row.blobPath);
    }
    return null;
}

export async function reparseZeroNetSdiInvoices(input?: {
    limit?: number;
    /** Include netCents null oltre a zero. */
    allZeroOrNull?: boolean;
    /** Data minima documento (YYYY-MM-DD). */
    sinceDate?: string;
}): Promise<ReparseZeroNetResult> {
    const result: ReparseZeroNetResult = {
        scanned: 0,
        updated: 0,
        skipped: 0,
        errors: [],
    };

    const netFilter = input?.allZeroOrNull
        ? { netCents: { lte: 0 } }
        : { netCents: 0 };

    const since =
        input?.sinceDate && /^\d{4}-\d{2}-\d{2}$/.test(input.sinceDate)
            ? new Date(`${input.sinceDate}T00:00:00.000Z`)
            : null;

    const rows = await prisma.manualFinanceExpense.findMany({
        where: {
            docType: { in: ['FATTURA', 'NOTA_CREDITO'] },
            ...netFilter,
            ...(since ? { expenseDate: { gte: since } } : {}),
            AND: [
                {
                    OR: [
                        { contentType: { contains: 'xml', mode: 'insensitive' } },
                        { fileName: { endsWith: '.xml', mode: 'insensitive' } },
                        { fileName: { endsWith: '.p7m', mode: 'insensitive' } },
                    ],
                },
                { OR: [{ blobUrl: { not: null } }, { blobPath: { not: null } }] },
            ],
        },
        orderBy: { expenseDate: 'desc' },
        take: input?.limit ?? 500,
        select: {
            id: true,
            fileName: true,
            blobUrl: true,
            blobPath: true,
            storageKind: true,
            netCents: true,
            vatCents: true,
            totalCents: true,
            notes: true,
            metadataJson: true,
        },
    });

    for (const row of rows) {
        result.scanned += 1;
        try {
            const buffer = await loadXmlBuffer(row);
            if (!buffer) {
                result.skipped += 1;
                continue;
            }

            const parsed = parseFatturaPaXml(buffer.toString('utf-8'), row.fileName || 'invoice.xml');
            const newNet = parsed.isReverseCharge ? parsed.totalCents : parsed.netCents;
            const newVat = parsed.isReverseCharge ? 0 : parsed.vatCents;
            const newTotal = parsed.totalCents;

            if (!newNet || Math.abs(newNet) === 0) {
                result.skipped += 1;
                continue;
            }

            if (newNet === row.netCents && newTotal === row.totalCents && newVat === row.vatCents) {
                result.skipped += 1;
                continue;
            }

            const updated = await prisma.manualFinanceExpense.update({
                where: { id: row.id },
                data: {
                    netCents: newNet,
                    vatCents: newVat,
                    totalCents: newTotal,
                    vatRate: parsed.vatRate,
                    notes: `${row.notes || ''} | reparse imponibile ${new Date().toISOString().slice(0, 10)}`.trim(),
                    metadataJson: {
                        ...((row.metadataJson as Record<string, unknown>) || {}),
                        reparseImponibileAt: new Date().toISOString(),
                        previousNetCents: row.netCents,
                    },
                },
            });

            upsertAccountingEntries([toLedgerEntry(updated.id, parsed, 'SDI_XML')]);

            result.updated += 1;
            console.info('[youdox][reparse] Imponibile aggiornato', {
                id: row.id,
                fileName: row.fileName,
                netCents: newNet,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            result.errors.push(`${row.fileName || row.id}: ${message}`);
        }
    }

    return result;
}
