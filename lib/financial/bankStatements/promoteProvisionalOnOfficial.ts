/**
 * Passaggio a definitivo: all'arrivo dell'estratto ufficiale del trimestre,
 * le righe provvisorie (lista movimenti) con fingerprint coincidente → certificate;
 * le altre del periodo coperto → Eccezioni (non cancellate).
 * METODO §2 v1.10.
 */
import prisma from '@/lib/prisma';
import {
    CERT_STATUS_CERTIFIED,
    CERT_STATUS_PROVISIONAL,
    CERT_STATUS_UNCONFIRMED,
    isPasteDocumentMeta,
    lineCertificationStatus,
} from '@/lib/financial/bankStatements/finecoOpenPeriod';

function asMeta(raw: unknown): Record<string, unknown> {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return { ...(raw as Record<string, unknown>) };
    }
    return {};
}

export async function promoteProvisionalLinesAfterOfficialUpload(input: {
    officialDocumentId: string;
    periodStart: Date | null;
    periodEnd: Date | null;
    officialFingerprints: string[];
}): Promise<{ certified: number; unconfirmed: number }> {
    const { officialDocumentId, periodStart, periodEnd, officialFingerprints } = input;
    if (!periodStart || !periodEnd) {
        return { certified: 0, unconfirmed: 0 };
    }

    const fpSet = new Set(officialFingerprints.filter(Boolean));

    const provisionalLines = await prisma.bankStatementLine.findMany({
        where: {
            documentId: { not: officialDocumentId },
            OR: [
                { accountingDate: { gte: periodStart, lte: periodEnd } },
                { valueDate: { gte: periodStart, lte: periodEnd } },
            ],
        },
        select: {
            id: true,
            fingerprint: true,
            rawJson: true,
            amountCents: true,
            accountingDate: true,
            valueDate: true,
            description: true,
            document: { select: { metadataJson: true } },
        },
        take: 50000,
    });

    const officialByFp = await prisma.bankStatementLine.findMany({
        where: {
            documentId: officialDocumentId,
            fingerprint: { in: [...fpSet] },
        },
        select: {
            fingerprint: true,
            amountCents: true,
            accountingDate: true,
            valueDate: true,
            description: true,
        },
    });
    const officialMap = new Map(
        officialByFp.filter((r) => r.fingerprint).map((r) => [r.fingerprint!, r])
    );

    let certified = 0;
    let unconfirmed = 0;

    for (const line of provisionalLines) {
        const cert = lineCertificationStatus(line.rawJson);
        const pasteDoc = isPasteDocumentMeta(line.document.metadataJson);
        const isProv =
            cert === CERT_STATUS_PROVISIONAL ||
            (pasteDoc && (cert == null || cert === CERT_STATUS_PROVISIONAL));
        if (!isProv) continue;

        const meta = asMeta(line.rawJson);
        const official = line.fingerprint ? officialMap.get(line.fingerprint) : undefined;

        if (official) {
            meta.certificationStatus = CERT_STATUS_CERTIFIED;
            meta.certifiedAt = new Date().toISOString();
            meta.certifiedByDocumentId = officialDocumentId;
            meta.source = meta.source || 'fineco_paste';
            await prisma.bankStatementLine.update({
                where: { id: line.id },
                data: {
                    // Allinea data/importo al documento banca (verità primaria)
                    amountCents: official.amountCents,
                    accountingDate: official.accountingDate ?? line.accountingDate,
                    valueDate: official.valueDate ?? line.valueDate,
                    description: official.description || line.description,
                    rawJson: meta as object,
                },
            });
            certified += 1;
        } else {
            meta.certificationStatus = CERT_STATUS_UNCONFIRMED;
            meta.unconfirmedAt = new Date().toISOString();
            meta.unconfirmedByDocumentId = officialDocumentId;
            meta.exceptionReason = 'movimento non confermato dall\'estratto ufficiale';
            await prisma.bankStatementLine.update({
                where: { id: line.id },
                data: { rawJson: meta as object },
            });
            unconfirmed += 1;
        }
    }

    // Documenti paste interamente nel periodo → metadata certificationStatus
    const pasteDocs = await prisma.bankStatementDocument.findMany({
        where: {
            id: { not: officialDocumentId },
            OR: [
                {
                    periodStart: { lte: periodEnd },
                    periodEnd: { gte: periodStart },
                },
            ],
        },
        select: { id: true, metadataJson: true },
    });

    for (const doc of pasteDocs) {
        if (!isPasteDocumentMeta(doc.metadataJson)) continue;
        const m = asMeta(doc.metadataJson);
        m.supersededByOfficialDocumentId = officialDocumentId;
        m.certificationStatus =
            unconfirmed > 0 && certified === 0
                ? CERT_STATUS_UNCONFIRMED
                : certified > 0
                  ? 'partially_certified'
                  : m.certificationStatus;
        await prisma.bankStatementDocument.update({
            where: { id: doc.id },
            data: { metadataJson: m as object },
        });
    }

    return { certified, unconfirmed };
}
