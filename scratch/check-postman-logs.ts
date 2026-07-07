import { loadEnvFiles } from '../lib/loadEnvFiles';
loadEnvFiles();
import prisma from '../lib/prisma';

async function main() {
    const logs = await prisma.floremoriaLog.findMany({
        where: { tag: { contains: 'POSTMAN_ASSISTENZA' } },
        orderBy: { id: 'desc' },
        take: 5,
        select: {
            id: true,
            sessionDate: true,
            tag: true,
            topic: true,
            shortSummary: true,
            keyPrompt: true,
            discussedPoints: true,
            achievedResults: true,
            fullText: true,
        },
    });

    for (const log of logs) {
        console.log('---');
        console.log(`id=${log.id} date=${log.sessionDate?.toISOString?.() || log.sessionDate}`);
        console.log(`tag=${log.tag}`);
        console.log(`topic=${log.topic}`);
        console.log(`summary=${log.shortSummary}`);
        console.log(`keyPrompt=${log.keyPrompt}`);
        console.log(`discussed=${log.discussedPoints}`);
        console.log(`result=${log.achievedResults}`);
        const preview = (log.fullText || '').slice(0, 400);
        console.log(`fullText preview:\n${preview}`);
    }

    console.log(`\nTotal recent POSTMAN logs shown: ${logs.length}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
