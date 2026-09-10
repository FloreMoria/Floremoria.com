/**
 * Statistiche righe bancarie provvisorie (lista movimenti) per trimestre — METODO §4.1.
 */
import prisma from '@/lib/prisma';
import type { TaxQuarter } from '@/lib/financial/taxQuarterly';
import {
    CERT_STATUS_PROVISIONAL,
    CERT_STATUS_UNCONFIRMED,
    isPasteDocumentMeta,
    lineCertificationStatus,
    resolveQuarterBounds,
} from '@/lib/financial/bankStatements/finecoOpenPeriod';

export type ProvisionalBankStats = {
    provisionalLineCount: number;
    provisionalAmountAbsCents: number;
    unconfirmedLineCount: number;
    hasProvisional: boolean;
};

export async function getProvisionalBankStats(
    year: number,
    quarter: TaxQuarter
): Promise<ProvisionalBankStats> {
    const { start, end } = resolveQuarterBounds(year, quarter as 1 | 2 | 3 | 4);

    const lines = await prisma.bankStatementLine.findMany({
        where: {
            OR: [
                { accountingDate: { gte: start, lte: end } },
                { valueDate: { gte: start, lte: end } },
            ],
        },
        select: {
            amountCents: true,
            rawJson: true,
            document: { select: { metadataJson: true, fileName: true } },
        },
        take: 50000,
    });

    let provisionalLineCount = 0;
    let provisionalAmountAbsCents = 0;
    let unconfirmedLineCount = 0;

    for (const line of lines) {
        const cert = lineCertificationStatus(line.rawJson);
        const pasteDoc = isPasteDocumentMeta(line.document.metadataJson);
        const isProv =
            cert === CERT_STATUS_PROVISIONAL ||
            (pasteDoc && (cert == null || cert === CERT_STATUS_PROVISIONAL));
        if (isProv) {
            provisionalLineCount += 1;
            provisionalAmountAbsCents += Math.abs(line.amountCents);
        }
        if (cert === CERT_STATUS_UNCONFIRMED) {
            unconfirmedLineCount += 1;
        }
    }

    return {
        provisionalLineCount,
        provisionalAmountAbsCents,
        unconfirmedLineCount,
        hasProvisional: provisionalLineCount > 0,
    };
}

export async function collectUnconfirmedBankExceptions(
    year: number,
    quarter: TaxQuarter
): Promise<
    Array<{
        date: string;
        description: string;
        amountCents: number;
        reason: string;
    }>
> {
    const { start, end } = resolveQuarterBounds(year, quarter as 1 | 2 | 3 | 4);
    const lines = await prisma.bankStatementLine.findMany({
        where: {
            OR: [
                { accountingDate: { gte: start, lte: end } },
                { valueDate: { gte: start, lte: end } },
            ],
        },
        select: {
            amountCents: true,
            description: true,
            accountingDate: true,
            valueDate: true,
            rawJson: true,
        },
        take: 50000,
    });

    const out: Array<{
        date: string;
        description: string;
        amountCents: number;
        reason: string;
    }> = [];

    for (const line of lines) {
        if (lineCertificationStatus(line.rawJson) !== CERT_STATUS_UNCONFIRMED) continue;
        const d = (line.accountingDate || line.valueDate)?.toISOString().slice(0, 10) || '';
        out.push({
            date: d,
            description: line.description,
            amountCents: line.amountCents,
            reason: 'movimento non confermato dall\'estratto ufficiale',
        });
    }
    return out;
}
