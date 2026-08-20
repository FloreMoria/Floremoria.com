/**
 * Persistenza rendiconti Fineco: Blob (o filesystem locale) + Prisma.
 */

import * as fs from 'fs';
import * as path from 'path';
import { del } from '@vercel/blob';
import prisma from '@/lib/prisma';
import { putBlobWithAccessFallback } from '@/lib/blob/storeAccess';
import { getLedger } from '@/lib/financial/ledgerStore';
import { parseBankStatementFile } from './parseFineco';
import { reconcileAllMovements } from './reconcileStatement';
import type { BankReconciliationReport } from './types';
import type { Prisma } from '@prisma/client';

const LOCAL_DIR = path.join(process.cwd(), 'data', 'bank-statements');
const BLOB_PREFIX = 'floremoria-finance/bank-statements';

function getBlobToken(): string | null {
    return process.env.BLOB_READ_WRITE_TOKEN?.trim() || null;
}

function ensureLocalDir() {
    if (!fs.existsSync(LOCAL_DIR)) {
        fs.mkdirSync(LOCAL_DIR, { recursive: true });
    }
}

function sanitizeFileName(name: string): string {
    return name.replace(/[^\w.\-()+ ]+/g, '_').slice(0, 180);
}

async function storeOriginalFile(
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
    const localName = `${stamp}_${safe}`;
    const full = path.join(LOCAL_DIR, localName);
    fs.writeFileSync(full, buffer);
    return { blobPath: full, blobUrl: null, storageKind: 'local' };
}

async function deleteStoredFile(blobPath: string, storageKind: string, blobUrl: string | null) {
    if (storageKind === 'local') {
        if (fs.existsSync(blobPath)) fs.unlinkSync(blobPath);
        return;
    }
    const token = getBlobToken();
    if (!token) return;
    try {
        await del(blobUrl || blobPath, { token });
    } catch (err) {
        console.warn('[bank-statements] delete blob failed', err);
    }
}

export async function readStatementBytes(
    blobPath: string,
    storageKind: string,
    blobUrl: string | null
): Promise<Buffer> {
    if (storageKind === 'local' || blobPath.startsWith('/') || blobPath.includes(path.sep)) {
        return fs.readFileSync(blobPath);
    }
    const url = blobUrl;
    if (!url) throw new Error('URL blob mancante per download');
    const token = getBlobToken();
    const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) throw new Error(`Download blob fallito (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
}

function toDate(iso: string | null | undefined): Date | null {
    if (!iso) return null;
    const d = new Date(`${iso.slice(0, 10)}T12:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
}

export async function listBankStatements() {
    return prisma.bankStatementDocument.findMany({
        orderBy: { uploadedAt: 'desc' },
        select: {
            id: true,
            fileName: true,
            contentType: true,
            sizeBytes: true,
            periodStart: true,
            periodEnd: true,
            status: true,
            parseError: true,
            closingBalanceCents: true,
            matchedCount: true,
            unmatchedCount: true,
            uploadedAt: true,
            processedAt: true,
        },
    });
}

export async function getBankStatementDetail(id: string) {
    return prisma.bankStatementDocument.findUnique({
        where: { id },
        include: {
            lines: { orderBy: { lineIndex: 'asc' } },
        },
    });
}

export async function deleteBankStatement(id: string) {
    const doc = await prisma.bankStatementDocument.findUnique({ where: { id } });
    if (!doc) return false;
    await deleteStoredFile(doc.blobPath, doc.storageKind, doc.blobUrl);
    await prisma.bankStatementDocument.delete({ where: { id } });
    return true;
}

export async function uploadAndProcessBankStatement(input: {
    fileName: string;
    contentType: string;
    buffer: Buffer;
}) {
    const { fileName, contentType, buffer } = input;
    const stored = await storeOriginalFile(buffer, fileName, contentType);

    const doc = await prisma.bankStatementDocument.create({
        data: {
            fileName,
            contentType: contentType || 'application/octet-stream',
            sizeBytes: buffer.byteLength,
            blobPath: stored.blobPath,
            blobUrl: stored.blobUrl,
            storageKind: stored.storageKind,
            status: 'PARSING',
        },
    });

    try {
        const parsed = await parseBankStatementFile(buffer, fileName, contentType);
        const matches = await reconcileAllMovements(parsed.movements);

        let matchedCount = 0;
        let unmatchedCount = 0;
        const lineRows: Prisma.BankStatementLineCreateManyInput[] = parsed.movements.map(
            (m, i) => {
                const match = matches[i];
                if (match.matchStatus === 'MATCHED') matchedCount += 1;
                else unmatchedCount += 1;
                return {
                    documentId: doc.id,
                    lineIndex: m.lineIndex,
                    valueDate: toDate(m.valueDate),
                    accountingDate: toDate(m.accountingDate),
                    description: m.description,
                    amountCents: m.amountCents,
                    debitCents: m.debitCents,
                    creditCents: m.creditCents,
                    balanceCents: m.balanceCents,
                    matchStatus: match.matchStatus,
                    matchType: match.matchType,
                    matchScore: match.matchScore,
                    matchedTxId: match.matchedTxId,
                    matchedOrderId: match.matchedOrderId,
                    matchNotes: match.matchNotes,
                    rawJson: (m.raw ?? undefined) as Prisma.InputJsonValue | undefined,
                };
            }
        );

        await prisma.$transaction([
            prisma.bankStatementLine.createMany({ data: lineRows }),
            prisma.bankStatementDocument.update({
                where: { id: doc.id },
                data: {
                    status: 'RECONCILED',
                    periodStart: toDate(parsed.periodStart),
                    periodEnd: toDate(parsed.periodEnd),
                    closingBalanceCents: parsed.closingBalanceCents,
                    matchedCount,
                    unmatchedCount,
                    processedAt: new Date(),
                    parseError: parsed.warnings.length ? parsed.warnings.join(' | ') : null,
                    metadataJson: {
                        warnings: parsed.warnings,
                        movementCount: parsed.movements.length,
                    },
                },
            }),
        ]);

        if (parsed.movements.length === 0) {
            await prisma.bankStatementDocument.update({
                where: { id: doc.id },
                data: {
                    status: 'FAILED',
                    parseError:
                        parsed.warnings.join(' | ') ||
                        'Nessun movimento estratto dal file caricato.',
                },
            });
        }

        return getBankStatementDetail(doc.id);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await prisma.bankStatementDocument.update({
            where: { id: doc.id },
            data: { status: 'FAILED', parseError: msg, processedAt: new Date() },
        });
        throw err;
    }
}

export async function buildBankReconciliationReport(
    documentId?: string
): Promise<BankReconciliationReport> {
    const doc = documentId
        ? await prisma.bankStatementDocument.findUnique({
              where: { id: documentId },
              include: { lines: { where: { matchStatus: { not: 'MATCHED' } }, take: 25, orderBy: { lineIndex: 'asc' } } },
          })
        : await prisma.bankStatementDocument.findFirst({
              where: { status: { in: ['PARSED', 'RECONCILED'] } },
              orderBy: { uploadedAt: 'desc' },
              include: {
                  lines: {
                      where: { matchStatus: { not: 'MATCHED' } },
                      take: 25,
                      orderBy: { lineIndex: 'asc' },
                  },
              },
          });

    const ledger = getLedger();
    const ledgerBalanceCents = (ledger.transactions || []).reduce((s, t) => s + t.amountCents, 0);

    const stripeNet = await prisma.stripeFinanceMovement.aggregate({
        _sum: { netCents: true, amountCents: true },
    });
    const stripeProxyCashCents = stripeNet._sum.netCents ?? stripeNet._sum.amountCents ?? 0;

    const bankClosing = doc?.closingBalanceCents ?? null;
    const delta =
        bankClosing == null ? 0 : bankClosing - ledgerBalanceCents;

    return {
        documentId: doc?.id ?? null,
        fileName: doc?.fileName ?? null,
        status: (doc?.status as BankReconciliationReport['status']) ?? null,
        periodStart: doc?.periodStart?.toISOString().slice(0, 10) ?? null,
        periodEnd: doc?.periodEnd?.toISOString().slice(0, 10) ?? null,
        bankClosingBalanceCents: bankClosing,
        ledgerBalanceCents,
        stripeProxyCashCents,
        deltaBankVsLedgerCents: delta,
        matchedCount: doc?.matchedCount ?? 0,
        unmatchedCount: doc?.unmatchedCount ?? 0,
        unmatchedSample: (doc?.lines || []).map((l) => ({
            id: l.id,
            date: (l.accountingDate || l.valueDate)?.toISOString().slice(0, 10) ?? null,
            description: l.description,
            amountCents: l.amountCents,
            matchNotes: l.matchNotes,
        })),
        asOf: new Date().toISOString(),
    };
}
