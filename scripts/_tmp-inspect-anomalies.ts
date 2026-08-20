import { loadEnvFiles } from '../lib/loadEnvFiles';
loadEnvFiles();
import { PrismaClient } from '@prisma/client';

async function main() {
    const prisma = new PrismaClient();
    const docs = await prisma.bankStatementDocument.findMany({
        orderBy: { uploadedAt: 'desc' },
        take: 3,
        select: { fileName: true, status: true, parseError: true, metadataJson: true },
    });
    for (const d of docs) {
        const m = d.metadataJson as Record<string, unknown> | null;
        console.log('---', d.fileName, d.status);
        console.log('parseError:', d.parseError);
        const anomalies = (m?.anomalies as unknown[]) || [];
        console.log('movements:', m?.movementCount, 'anomalies:', anomalies.length);
        if (anomalies.length) console.log(JSON.stringify(anomalies, null, 2));
    }
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
