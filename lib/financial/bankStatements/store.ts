/**
 * Persistenza rendiconti Fineco: Blob (o filesystem locale) + Prisma.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { del } from '@vercel/blob';
import prisma from '@/lib/prisma';
import { putBlobWithAccessFallback } from '@/lib/blob/storeAccess';
import { getLedger } from '@/lib/financial/ledgerStore';
import { parseBankStatementFile } from './parseFineco';
import {
    buildFinecoDedupKey,
    parseFinecoPasteText,
    type FinecoPasteMovement,
} from './parseFinecoPaste';
import { reconcileAllMovements } from './reconcileStatement';
import type { BankReconciliationReport, ParsedBankMovement } from './types';
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

/** SHA-256 hex del buffer file (dedup estratto Fineco). */
export function sha256Hex(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
}

/** Fingerprint movimento: SHA-256 della chiave naturale Fineco. */
export function movementFingerprint(
    dateIso: string | null,
    amountCents: number,
    description: string
): string {
    return createHash('sha256')
        .update(buildFinecoDedupKey(dateIso, amountCents, description))
        .digest('hex');
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
            openingBalanceCents: true,
            closingBalanceCents: true,
            matchedCount: true,
            unmatchedCount: true,
            uploadedAt: true,
            processedAt: true,
            metadataJson: true,
        },
    });
}

/**
 * Archivio completo movimenti (tutti i PDF) con metadati documento.
 * year = undefined → tutti; altrimenti filtro su accountingDate/valueDate.
 */
export async function listBankStatementMovements(params?: {
    year?: number | null;
}) {
    const year = params?.year ?? null;
    const dateFilter =
        year != null && Number.isFinite(year)
            ? {
                  OR: [
                      {
                          accountingDate: {
                              gte: new Date(Date.UTC(year, 0, 1)),
                              lt: new Date(Date.UTC(year + 1, 0, 1)),
                          },
                      },
                      {
                          AND: [
                              { accountingDate: null },
                              {
                                  valueDate: {
                                      gte: new Date(Date.UTC(year, 0, 1)),
                                      lt: new Date(Date.UTC(year + 1, 0, 1)),
                                  },
                              },
                          ],
                      },
                  ],
              }
            : undefined;

    const lines = await prisma.bankStatementLine.findMany({
        where: dateFilter,
        orderBy: [{ accountingDate: 'desc' }, { valueDate: 'desc' }, { lineIndex: 'asc' }],
        include: {
            document: {
                select: {
                    id: true,
                    fileName: true,
                    periodStart: true,
                    periodEnd: true,
                },
            },
        },
        take: 20000,
    });

    // Anni disponibili su tutto l'archivio (non solo sul filtro corrente)
    const yearRows = await prisma.$queryRaw<Array<{ y: number }>>`
        SELECT DISTINCT EXTRACT(YEAR FROM COALESCE(accounting_date, value_date))::int AS y
        FROM bank_statement_lines
        WHERE COALESCE(accounting_date, value_date) IS NOT NULL
        ORDER BY y DESC
    `;

    const years = [
        ...new Set(
            yearRows
                .map((r) => Number(r.y))
                .filter((y) => Number.isFinite(y) && y >= 2000 && y <= 2100)
        ),
    ].sort((a, b) => b - a);

    return {
        years,
        lines: lines.map((l) => {
            const periodStart = l.document.periodStart;
            const periodEnd = l.document.periodEnd;
            let quarterLabel: string | null = null;
            const ref: Date | null = l.accountingDate || l.valueDate || periodStart || null;
            if (ref) {
                const m = ref.getUTCMonth();
                const y = ref.getUTCFullYear();
                quarterLabel = `Q${Math.floor(m / 3) + 1} ${y}`;
            }
            return {
                id: l.id,
                documentId: l.documentId,
                lineIndex: l.lineIndex,
                valueDate: l.valueDate?.toISOString() ?? null,
                accountingDate: l.accountingDate?.toISOString() ?? null,
                description: l.description,
                amountCents: l.amountCents,
                debitCents: l.debitCents,
                creditCents: l.creditCents,
                balanceCents: l.balanceCents,
                matchStatus: l.matchStatus,
                matchType: l.matchType,
                matchScore: l.matchScore,
                matchedTxId: l.matchedTxId,
                matchedOrderId: l.matchedOrderId,
                matchNotes: l.matchNotes,
                fileName: l.document.fileName,
                periodStart: periodStart?.toISOString() ?? null,
                periodEnd: periodEnd?.toISOString() ?? null,
                quarterLabel,
            };
        }),
    };
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

export type PastePreviewRow = {
    lineIndex: number;
    date: string | null;
    description: string;
    typology: string | null;
    amountCents: number;
    dedupKey: string;
    status: 'NEW' | 'DUPLICATE';
};

async function existingDedupKeysForMovements(
    movements: FinecoPasteMovement[]
): Promise<Set<string>> {
    const dates = movements
        .map((m) => m.accountingDate || m.valueDate)
        .filter((d): d is string => Boolean(d));
    if (dates.length === 0 && movements.length === 0) return new Set();

    const sorted = [...dates].sort();
    const minIso = sorted[0] || '2000-01-01';
    const maxIso = sorted[sorted.length - 1] || '2100-12-31';
    // Margine ±3 giorni per mismatch data valuta/operazione
    const minDate = new Date(`${minIso}T00:00:00.000Z`);
    minDate.setUTCDate(minDate.getUTCDate() - 3);
    const maxDate = new Date(`${maxIso}T23:59:59.999Z`);
    maxDate.setUTCDate(maxDate.getUTCDate() + 3);

    const amounts = [...new Set(movements.map((m) => m.amountCents))];

    const existing = await prisma.bankStatementLine.findMany({
        where: {
            amountCents: { in: amounts },
            OR: [
                { accountingDate: { gte: minDate, lte: maxDate } },
                { valueDate: { gte: minDate, lte: maxDate } },
                { AND: [{ accountingDate: null }, { valueDate: null }] },
            ],
        },
        select: {
            accountingDate: true,
            valueDate: true,
            amountCents: true,
            description: true,
        },
        take: 20000,
    });

    const keys = new Set<string>();
    for (const row of existing) {
        const dateIso =
            (row.accountingDate || row.valueDate)?.toISOString().slice(0, 10) ?? null;
        keys.add(buildFinecoDedupKey(dateIso, row.amountCents, row.description));
    }
    return keys;
}

/** Anteprima parse + stato Nuovo / Già presente (vs PDF e paste precedenti). */
export async function previewFinecoPaste(rawText: string) {
    const parsed = parseFinecoPasteText(rawText);
    const existingKeys = await existingDedupKeysForMovements(parsed.pasteMovements);

    const rows: PastePreviewRow[] = parsed.pasteMovements.map((m) => ({
        lineIndex: m.lineIndex,
        date: m.accountingDate || m.valueDate,
        description: m.description,
        typology: m.typology,
        amountCents: m.amountCents,
        dedupKey: m.dedupKey,
        status: existingKeys.has(m.dedupKey) ? 'DUPLICATE' : 'NEW',
    }));

    const newCount = rows.filter((r) => r.status === 'NEW').length;
    const duplicateCount = rows.filter((r) => r.status === 'DUPLICATE').length;

    return {
        rows,
        newCount,
        duplicateCount,
        parseSummary: parsed.parseSummary,
        warnings: parsed.warnings,
        anomalies: parsed.anomalies || [],
        periodStart: parsed.periodStart,
        periodEnd: parsed.periodEnd,
    };
}

/**
 * Salva solo i movimenti NEW da testo Fineco + auto-match (fioristi, Stripe/PayPal, canoni/bollo).
 */
export async function confirmFinecoPaste(rawText: string) {
    const parsed = parseFinecoPasteText(rawText);
    if (parsed.pasteMovements.length === 0) {
        throw new Error(
            parsed.parseSummary || 'Nessun movimento riconosciuto nel testo incollato'
        );
    }

    const existingKeys = await existingDedupKeysForMovements(parsed.pasteMovements);
    const toSave: FinecoPasteMovement[] = parsed.pasteMovements.filter(
        (m) => !existingKeys.has(m.dedupKey)
    );

    if (toSave.length === 0) {
        return {
            document: null,
            savedCount: 0,
            skippedDuplicates: parsed.pasteMovements.length,
            matchedCount: 0,
            unmatchedCount: 0,
            message: 'Tutti i movimenti incollati risultano già presenti in archivio.',
        };
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `fineco-paste-${stamp}.txt`;
    const buffer = Buffer.from(rawText, 'utf-8');
    const fileHash = sha256Hex(buffer);

    const existingDoc = await prisma.bankStatementDocument.findUnique({
        where: { sha256Hash: fileHash },
    });
    if (existingDoc) {
        const detail = await getBankStatementDetail(existingDoc.id);
        return {
            document: detail,
            savedCount: 0,
            skippedDuplicates: parsed.pasteMovements.length,
            matchedCount: existingDoc.matchedCount,
            unmatchedCount: existingDoc.unmatchedCount,
            message: 'Questo testo Fineco è già stato caricato (hash SHA-256 identico).',
        };
    }

    const stored = await storeOriginalFile(buffer, fileName, 'text/plain');

    const doc = await prisma.bankStatementDocument.create({
        data: {
            fileName,
            contentType: 'text/plain',
            sizeBytes: buffer.byteLength,
            blobPath: stored.blobPath,
            blobUrl: stored.blobUrl,
            storageKind: stored.storageKind,
            sha256Hash: fileHash,
            status: 'PARSING',
            metadataJson: {
                source: 'fineco_paste',
                pastedAt: new Date().toISOString(),
            },
        },
    });

    try {
        const asMovements: ParsedBankMovement[] = toSave.map((m, i) => ({
            ...m,
            lineIndex: i,
        }));
        const matches = await reconcileAllMovements(asMovements);

        let matchedCount = 0;
        let unmatchedCount = 0;
        const lineRows: Prisma.BankStatementLineCreateManyInput[] = asMovements.map(
            (m, i) => {
                const match = matches[i];
                if (match.matchStatus === 'MATCHED') matchedCount += 1;
                else unmatchedCount += 1;
                const dateIso = m.accountingDate || m.valueDate || null;
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
                    fingerprint: movementFingerprint(dateIso, m.amountCents, m.description),
                };
            }
        );

        const dates = asMovements
            .map((m) => m.accountingDate || m.valueDate)
            .filter((d): d is string => Boolean(d))
            .sort();

        const parseSummary = `Incolla Fineco: ${asMovements.length} nuovi salvati · ${parsed.pasteMovements.length - asMovements.length} duplicati saltati · ${matchedCount} abbinati automaticamente`;

        await prisma.$transaction([
            prisma.bankStatementLine.createMany({ data: lineRows, skipDuplicates: true }),
            prisma.bankStatementDocument.update({
                where: { id: doc.id },
                data: {
                    status: 'RECONCILED',
                    periodStart: toDate(dates[0] || null),
                    periodEnd: toDate(dates[dates.length - 1] || null),
                    matchedCount,
                    unmatchedCount,
                    processedAt: new Date(),
                    parseError: null,
                    metadataJson: {
                        source: 'fineco_paste',
                        warnings: parsed.warnings,
                        movementCount: asMovements.length,
                        skippedDuplicates: parsed.pasteMovements.length - asMovements.length,
                        parseSummary,
                        anomalies: parsed.anomalies || [],
                    },
                },
            }),
        ]);

        const detail = await getBankStatementDetail(doc.id);
        return {
            document: detail,
            savedCount: asMovements.length,
            skippedDuplicates: parsed.pasteMovements.length - asMovements.length,
            matchedCount,
            unmatchedCount,
            message: parseSummary,
        };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await prisma.bankStatementDocument.update({
            where: { id: doc.id },
            data: { status: 'FAILED', parseError: msg, processedAt: new Date() },
        });
        throw err;
    }
}

export async function uploadAndProcessBankStatement(input: {
    fileName: string;
    contentType: string;
    buffer: Buffer;
}) {
    const { fileName, contentType, buffer } = input;
    const fileHash = sha256Hex(buffer);

    const existingDoc = await prisma.bankStatementDocument.findUnique({
        where: { sha256Hash: fileHash },
    });
    if (existingDoc) {
        const detail = await getBankStatementDetail(existingDoc.id);
        return detail
            ? {
                  ...detail,
                  parseSummary:
                      'Estratto conto già presente in archivio (hash SHA-256 identico). Nessun duplicato creato.',
                  duplicateSha256: true,
              }
            : detail;
    }

    const stored = await storeOriginalFile(buffer, fileName, contentType);

    const doc = await prisma.bankStatementDocument.create({
        data: {
            fileName,
            contentType: contentType || 'application/octet-stream',
            sizeBytes: buffer.byteLength,
            blobPath: stored.blobPath,
            blobUrl: stored.blobUrl,
            storageKind: stored.storageKind,
            sha256Hash: fileHash,
            status: 'PARSING',
        },
    });

    try {
        const parsed = await parseBankStatementFile(buffer, fileName, contentType);

        // Dedup per fingerprint: evita raddoppio se stessi movimenti già da paste/altro file.
        const fingerprints = parsed.movements.map((m) =>
            movementFingerprint(m.accountingDate || m.valueDate || null, m.amountCents, m.description)
        );
        const existingFp = fingerprints.length
            ? await prisma.bankStatementLine.findMany({
                  where: { fingerprint: { in: fingerprints } },
                  select: { fingerprint: true },
              })
            : [];
        const existingFpSet = new Set(
            existingFp.map((r) => r.fingerprint).filter((f): f is string => Boolean(f))
        );
        const newMovements = parsed.movements.filter(
            (m, i) => !existingFpSet.has(fingerprints[i])
        );
        const skippedByFingerprint = parsed.movements.length - newMovements.length;

        const matches = await reconcileAllMovements(newMovements);

        let matchedCount = 0;
        let unmatchedCount = 0;
        const lineRows: Prisma.BankStatementLineCreateManyInput[] = newMovements.map(
            (m, i) => {
                const match = matches[i];
                if (match.matchStatus === 'MATCHED') matchedCount += 1;
                else unmatchedCount += 1;
                const dateIso = m.accountingDate || m.valueDate || null;
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
                    fingerprint: movementFingerprint(dateIso, m.amountCents, m.description),
                };
            }
        );

        const warnAnomalies = (parsed.anomalies || []).filter(
            (a) => a.severity === 'warn' || a.severity === 'error'
        );
        const parseInfoMessage =
            parsed.parseSummary ||
            (warnAnomalies.length
                ? warnAnomalies.map((a) => a.message).join(' | ')
                : null);

        await prisma.$transaction([
            prisma.bankStatementLine.createMany({ data: lineRows, skipDuplicates: true }),
            prisma.bankStatementDocument.update({
                where: { id: doc.id },
                data: {
                    status: 'RECONCILED',
                    periodStart: toDate(parsed.periodStart),
                    periodEnd: toDate(parsed.periodEnd),
                    openingBalanceCents: parsed.openingBalanceCents ?? null,
                    closingBalanceCents: parsed.closingBalanceCents,
                    matchedCount,
                    unmatchedCount,
                    processedAt: new Date(),
                    // Solo problemi reali in parseError; il summary informativo resta in metadata
                    parseError: warnAnomalies.length
                        ? warnAnomalies.map((a) => a.message).slice(0, 3).join(' | ')
                        : null,
                    metadataJson: {
                        warnings: parsed.warnings,
                        movementCount: newMovements.length,
                        skippedByFingerprint,
                        ignoredMarginNotes: parsed.ignoredMarginNotes ?? 0,
                        parseSummary: parsed.parseSummary || parseInfoMessage,
                        ...(parsed.textPreview?.length
                            ? { textPreview: parsed.textPreview }
                            : {}),
                        ...(parsed.anomalies?.length ? { anomalies: parsed.anomalies } : {}),
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
                    metadataJson: {
                        warnings: parsed.warnings,
                        movementCount: 0,
                        ignoredMarginNotes: parsed.ignoredMarginNotes ?? 0,
                        parseSummary: parsed.parseSummary,
                        ...(parsed.textPreview?.length
                            ? { textPreview: parsed.textPreview }
                            : {}),
                        ...(parsed.anomalies?.length ? { anomalies: parsed.anomalies } : {}),
                    },
                },
            });
        } else if (newMovements.length === 0) {
            await prisma.bankStatementDocument.update({
                where: { id: doc.id },
                data: {
                    status: 'RECONCILED',
                    parseError: null,
                    metadataJson: {
                        warnings: parsed.warnings,
                        movementCount: 0,
                        skippedByFingerprint,
                        parseSummary:
                            'Tutti i movimenti del file risultano già presenti (fingerprint).',
                        ...(parsed.textPreview?.length
                            ? { textPreview: parsed.textPreview }
                            : {}),
                    },
                },
            });
        }

        const detail = await getBankStatementDetail(doc.id);
        return detail
            ? {
                  ...detail,
                  textPreview: parsed.textPreview,
                  anomalies: parsed.anomalies,
                  ignoredMarginNotes: parsed.ignoredMarginNotes ?? 0,
                  parseSummary: parsed.parseSummary || parseInfoMessage,
                  skippedByFingerprint,
              }
            : detail;
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
