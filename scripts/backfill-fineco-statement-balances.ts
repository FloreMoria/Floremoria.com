/**
 * Backfill opening/closing balance su BankStatementDocument da PDF Fineco già allegati.
 * Uso: npx tsx scripts/backfill-fineco-statement-balances.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

async function main() {
    const prisma = (await import('../lib/prisma')).default;
    const { parseFinecoPdfTabular } = await import('../lib/financial/parseFinecoPdf');
    const { computeFinanceQuadratura } = await import('../lib/financial/financeQuadratura');

    const docs = await prisma.bankStatementDocument.findMany({
        where: {
            OR: [
                { contentType: { contains: 'pdf' } },
                { fileName: { endsWith: '.pdf' } },
                { fileName: { endsWith: '.PDF' } },
            ],
        },
        select: {
            id: true,
            fileName: true,
            blobUrl: true,
            storageKind: true,
            blobPath: true,
            openingBalanceCents: true,
            closingBalanceCents: true,
        },
    });

    console.log(`Documents PDF: ${docs.length}`);

    for (const doc of docs) {
        if (!doc.blobUrl && doc.storageKind !== 'local') {
            console.warn(`SKIP ${doc.fileName}: no blobUrl`);
            continue;
        }
        try {
            let buffer: Buffer;
            if (doc.storageKind === 'local' && doc.blobPath) {
                const { readFileSync } = await import('fs');
                buffer = readFileSync(doc.blobPath);
            } else {
                const res = await fetch(doc.blobUrl!);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                buffer = Buffer.from(await res.arrayBuffer());
            }

            const parsed = await parseFinecoPdfTabular(buffer);
            console.log(
                doc.fileName,
                '→ opening=',
                parsed.openingBalanceCents,
                'closing=',
                parsed.closingBalanceCents,
                'movements=',
                parsed.movements.length
            );

            await prisma.bankStatementDocument.update({
                where: { id: doc.id },
                data: {
                    openingBalanceCents: parsed.openingBalanceCents,
                    closingBalanceCents:
                        parsed.closingBalanceCents ?? doc.closingBalanceCents,
                    metadataJson: {
                        ...(((
                            await prisma.bankStatementDocument.findUnique({
                                where: { id: doc.id },
                                select: { metadataJson: true },
                            })
                        )?.metadataJson as object) || {}),
                        openingBalanceCents: parsed.openingBalanceCents,
                        closingBalanceCents: parsed.closingBalanceCents,
                        balancesBackfilledAt: new Date().toISOString(),
                    },
                },
            });
        } catch (err) {
            console.error(`FAIL ${doc.fileName}:`, err instanceof Error ? err.message : err);
        }
    }

    const q = await computeFinanceQuadratura();
    console.log(
        JSON.stringify(
            {
                opening: q.openingBalanceCents,
                closing: q.statementClosingCents,
                movementsSum: q.movementsSumCents,
                calculated: q.calculatedBalanceCents,
                real: q.realBalanceCents,
                diff: q.balanceDiffCents,
                calculatedEuro: (q.calculatedBalanceCents / 100).toFixed(2),
                realEuro: q.realBalanceCents != null ? (q.realBalanceCents / 100).toFixed(2) : null,
                diffEuro: q.balanceDiffCents != null ? (q.balanceDiffCents / 100).toFixed(2) : null,
            },
            null,
            2
        )
    );

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error(err);
    process.exit(1);
});
