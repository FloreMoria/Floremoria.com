/**
 * One-shot: riclassifica documenti fineco_paste già in archivio → stato provvisorio.
 * METODO §2 v1.10 — i 7 paste restano validi ma dichiarati provvisori.
 *
 * Uso: npx tsx scripts/reclassify-fineco-paste-provisional.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();
if (process.env.DATABASE_URL_UNPOOLED) {
    process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
}

import prisma from '@/lib/prisma';
import {
    CERT_STATUS_PROVISIONAL,
    PASTE_SOURCE,
    isPasteDocumentMeta,
} from '@/lib/financial/bankStatements/finecoOpenPeriod';

function asMeta(raw: unknown): Record<string, unknown> {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return { ...(raw as Record<string, unknown>) };
    }
    return {};
}

function quarterLabel(d: Date | null): string {
    if (!d) return 'periodo n/d';
    const y = d.getUTCFullYear();
    const q = Math.floor(d.getUTCMonth() / 3) + 1;
    return `T${q} ${y}`;
}

async function main() {
    const docs = await prisma.bankStatementDocument.findMany({
        where: {
            OR: [
                { fileName: { startsWith: 'fineco-paste-' } },
                { contentType: 'text/plain' },
            ],
        },
        select: {
            id: true,
            fileName: true,
            metadataJson: true,
            periodStart: true,
            periodEnd: true,
            uploadedAt: true,
            _count: { select: { lines: true } },
        },
        orderBy: { uploadedAt: 'asc' },
    });

    const pasteDocs = docs.filter(
        (d) =>
            d.fileName.startsWith('fineco-paste-') ||
            isPasteDocumentMeta(d.metadataJson) ||
            (d.contentType === 'text/plain' && d.fileName.includes('paste'))
    );

    console.log(`Documenti paste candidati: ${pasteDocs.length}`);
    const byPeriod = new Map<string, number>();

    for (const doc of pasteDocs) {
        const meta = asMeta(doc.metadataJson);
        meta.source = PASTE_SOURCE;
        meta.origin = PASTE_SOURCE;
        meta.certificationStatus = CERT_STATUS_PROVISIONAL;
        meta.reclassifiedAt = new Date().toISOString();
        meta.reclassifiedReason = 'METODO v1.10 — archivio paste → stato provvisorio';

        await prisma.bankStatementDocument.update({
            where: { id: doc.id },
            data: { metadataJson: meta as object },
        });

        const lines = await prisma.bankStatementLine.findMany({
            where: { documentId: doc.id },
            select: { id: true, rawJson: true },
        });
        for (const line of lines) {
            const raw = asMeta(line.rawJson);
            raw.source = PASTE_SOURCE;
            raw.certificationStatus = CERT_STATUS_PROVISIONAL;
            await prisma.bankStatementLine.update({
                where: { id: line.id },
                data: { rawJson: raw as object },
            });
        }

        const label = quarterLabel(doc.periodStart || doc.periodEnd || doc.uploadedAt);
        byPeriod.set(label, (byPeriod.get(label) || 0) + 1);
        console.log(
            `  OK ${doc.fileName} · linee=${doc._count.lines} · ${label} · id=${doc.id}`
        );
    }

    console.log('\nRiepilogo per periodo:');
    for (const [k, v] of [...byPeriod.entries()].sort()) {
        console.log(`  ${k}: ${v} documenti`);
    }
    console.log(`\nTotale riclassificati: ${pasteDocs.length}`);
    await prisma.$disconnect();
}

main().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
