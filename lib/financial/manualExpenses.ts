/**
 * Spese / documenti manuali Contabilità (fatture, scontrini, ricevute).
 */

import * as fs from 'fs';
import * as path from 'path';
import { del } from '@vercel/blob';
import prisma from '@/lib/prisma';
import { putBlobWithAccessFallback } from '@/lib/blob/storeAccess';
import { addAccountingEntries } from '@/lib/financial/ledgerStore';
import { LEDGER_BANK_ACCOUNT } from '@/lib/financial/companyBankDetails';
import type { AccountingEntry } from '@/lib/financial/types';
import {
    FOREIGN_AUTOFATTURA_SOURCE,
    SAAS_FOREIGN_VENDOR_RE,
} from '@/lib/financial/foreignAutofattura';
import type { Prisma } from '@prisma/client';

const LOCAL_DIR = path.join(process.cwd(), 'data', 'manual-expenses');
const BLOB_PREFIX = 'floremoria-finance/manual-expenses';

export type ManualDocType = 'FATTURA' | 'SCONTRINO' | 'RICEVUTA';

function getBlobToken(): string | null {
    return process.env.BLOB_READ_WRITE_TOKEN?.trim() || null;
}

function periodKeyFromDate(d: Date): string {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function sanitizeFileName(name: string): string {
    return name.replace(/[^\w.\-()+ ]+/g, '_').slice(0, 180);
}

async function storeAttachment(
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

export async function listManualExpenses(limit = 100) {
    return prisma.manualFinanceExpense.findMany({
        orderBy: { expenseDate: 'desc' },
        take: Math.min(Math.max(limit, 1), 300),
    });
}

export async function sumManualExpensesCents(): Promise<number> {
    const agg = await prisma.manualFinanceExpense.aggregate({ _sum: { totalCents: true } });
    return agg._sum.totalCents || 0;
}

export async function createManualExpense(input: {
    expenseDate: string;
    docType: ManualDocType;
    vendorName: string;
    description: string;
    totalCents: number;
    vatRate: number;
    file?: { buffer: Buffer; fileName: string; contentType: string } | null;
    notes?: string | null;
    /** Metadati fiscali (es. orderId) — mai usati per GdM/bacheche. */
    metadataJson?: Record<string, unknown> | null;
    matchedStatementLineId?: string | null;
    reconciled?: boolean;
}) {
    const expenseDate = new Date(`${input.expenseDate.slice(0, 10)}T12:00:00.000Z`);
    if (Number.isNaN(expenseDate.getTime())) throw new Error('Data non valida');

    const totalCents = Math.round(input.totalCents);
    if (!Number.isFinite(totalCents) || totalCents <= 0) throw new Error('Importo non valido');

    const vatRate = Number.isFinite(input.vatRate) ? input.vatRate : 0;
    const vatCents =
        vatRate > 0 ? Math.round(totalCents - totalCents / (1 + vatRate / 100)) : 0;
    const netCents = totalCents - vatCents;

    let stored: { blobPath: string | null; blobUrl: string | null; storageKind: string; fileName: string | null; contentType: string | null; sizeBytes: number | null } = {
        blobPath: null,
        blobUrl: null,
        storageKind: 'none',
        fileName: null,
        contentType: null,
        sizeBytes: null,
    };

    if (input.file) {
        const up = await storeAttachment(
            input.file.buffer,
            input.file.fileName,
            input.file.contentType
        );
        stored = {
            blobPath: up.blobPath,
            blobUrl: up.blobUrl,
            storageKind: up.storageKind,
            fileName: input.file.fileName,
            contentType: input.file.contentType,
            sizeBytes: input.file.buffer.byteLength,
        };
    }

    const row = await prisma.manualFinanceExpense.create({
        data: {
            expenseDate,
            docType: input.docType,
            vendorName: input.vendorName.trim(),
            description: input.description.trim(),
            totalCents,
            vatRate,
            vatCents,
            netCents,
            fileName: stored.fileName,
            contentType: stored.contentType,
            sizeBytes: stored.sizeBytes,
            blobPath: stored.blobPath,
            blobUrl: stored.blobUrl,
            storageKind: stored.storageKind,
            periodKey: periodKeyFromDate(expenseDate),
            notes: input.notes?.trim() || null,
            metadataJson: (input.metadataJson as Prisma.InputJsonValue | undefined) ?? undefined,
            matchedStatementLineId: input.matchedStatementLineId ?? null,
            reconciled: Boolean(input.reconciled),
        },
    });

    // Prima nota uscite (conto costi generici / SaaS se suggerito dalla causale)
    const descUpper = `${input.vendorName} ${input.description}`.toUpperCase();
    const dareAccount =
        /VERCEL|OPENAI|GOOGLE|AWS|CURSOR|ANTHROPIC|META|STRIPE|SAAS|SOFTWARE/.test(descUpper)
            ? '70300 - Software SaaS (Estero)'
            : '70900 - Spese Generali / Varie';

    const entry: AccountingEntry = {
        id: `entry_manual_exp_${row.id}`,
        date: expenseDate.toISOString().slice(0, 10),
        description: `${input.docType} ${input.vendorName} — ${input.description}`.slice(0, 240),
        dareAccount,
        avereAccount: LEDGER_BANK_ACCOUNT,
        amountCents: totalCents,
        vatAmountCents: vatCents,
        isForeignService: dareAccount.includes('SaaS'),
        invoiceReference: row.id.slice(-8).toUpperCase(),
        status: 'CONFIRMED',
    };
    addAccountingEntries([entry]);

    return row;
}

export async function deleteManualExpense(id: string) {
    const row = await prisma.manualFinanceExpense.findUnique({ where: { id } });
    if (!row) return false;
    if (row.storageKind === 'local' && row.blobPath && fs.existsSync(row.blobPath)) {
        fs.unlinkSync(row.blobPath);
    } else if (row.storageKind === 'blob') {
        const token = getBlobToken();
        if (token && (row.blobUrl || row.blobPath)) {
            try {
                await del(row.blobUrl || row.blobPath!, { token });
            } catch (err) {
                console.warn('[manual-expenses] delete blob', err);
            }
        }
    }
    await prisma.manualFinanceExpense.delete({ where: { id } });
    return true;
}

/** Match uscite estratto vs spese manuali / fatture SDI non ancora riconciliate. */
export async function matchManualExpenseByAmount(
    amountCentsAbs: number,
    accountingDateIso: string | null,
    description: string
): Promise<{
    id: string;
    vendorName: string;
    score: number;
    isForeignAutofattura?: boolean;
} | null> {
    const tolerance = 200; // ±2 € (FX / carta SaaS)
    const candidates = await prisma.manualFinanceExpense.findMany({
        where: {
            reconciled: false,
            totalCents: {
                gte: amountCentsAbs - tolerance,
                lte: amountCentsAbs + tolerance,
            },
        },
        orderBy: { expenseDate: 'desc' },
        take: 80,
        select: {
            id: true,
            vendorName: true,
            expenseDate: true,
            totalCents: true,
            metadataJson: true,
            description: true,
        },
    });
    if (!candidates.length) return null;

    // Data obbligatoria: niente match solo-importo senza vincolo temporale.
    if (!accountingDateIso) return null;
    const centerMs = Date.parse(accountingDateIso.slice(0, 10));
    if (!Number.isFinite(centerMs)) return null;
    const maxWindowMs = 45 * 24 * 60 * 60 * 1000;

    const desc = description
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase();
    const descDigits = desc.replace(/\D/g, '');
    const descIsSaas = SAAS_FOREIGN_VENDOR_RE.test(desc);

    const scored = candidates
        .filter((c) => Math.abs(c.expenseDate.getTime() - centerMs) <= maxWindowMs)
        .map((c) => {
        let score = 0; // niente base score sull'importo solo
        const vendor = c.vendorName
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase();
        const tokens = vendor.split(/[^A-Z0-9]+/).filter((t) => t.length > 3);
        let tokenHits = 0;
        for (const t of tokens.slice(0, 6)) {
            if (desc.includes(t)) tokenHits += 1;
        }
        score += Math.min(40, tokenHits * 12);
        if (vendor.length >= 5 && desc.includes(vendor.slice(0, Math.min(12, vendor.length)))) {
            score += 15;
        }
        const meta = (c.metadataJson || {}) as {
            vendorVat?: string | null;
            source?: string;
            isForeignAutofattura?: boolean;
            isReverseCharge?: boolean;
        };
        const vatDigits = (meta.vendorVat || '').replace(/\D/g, '');
        if (vatDigits.length >= 8 && descDigits.includes(vatDigits.slice(-11))) {
            score += 35;
        }
        const isForeign =
            meta.source === FOREIGN_AUTOFATTURA_SOURCE ||
            meta.source === 'AUTOFATTURA_TD17' ||
            meta.source === 'AUTOFATTURA_TD18' ||
            Boolean(meta.isForeignAutofattura || meta.isReverseCharge);
        if (isForeign && descIsSaas) score += 30;
        if (isForeign && SAAS_FOREIGN_VENDOR_RE.test(vendor) && descIsSaas) score += 15;
        if (Math.abs(c.totalCents - amountCentsAbs) === 0) score += 15;
        else if (Math.abs(c.totalCents - amountCentsAbs) <= 50) score += 8;
        else if (Math.abs(c.totalCents - amountCentsAbs) <= 200 && isForeign) score += 6;
        const d = Math.abs(centerMs - c.expenseDate.getTime());
        if (d <= 15 * 24 * 60 * 60 * 1000) score += 15;
        else if (d <= 45 * 24 * 60 * 60 * 1000) score += 5;
        return { c, score, isForeign, tokenHits };
    });
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    // Richiede almeno un segnale di causale/fornitore (non solo importo+data)
    if (!best || best.score < 70 || (best.tokenHits < 1 && !best.isForeign && best.score < 85)) {
        return null;
    }
    return {
        id: best.c.id,
        vendorName: best.c.vendorName,
        score: best.score,
        isForeignAutofattura: best.isForeign,
    };
}

export async function markManualExpenseReconciled(
    id: string,
    statementLineId: string | null
) {
    await prisma.manualFinanceExpense.update({
        where: { id },
        data: {
            reconciled: true,
            matchedStatementLineId: statementLineId,
        },
    });
}
