import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testQuery() {
    console.log("Fetching logs from the DB...");
    const logs = await prisma.floremoriaLog.findMany({
        where: {
            sessionDate: { gte: new Date('2026-03-25T00:00:00.000Z') }
        },
        orderBy: { id: 'desc' },
        take: 5
    });

    for (const log of logs) {
        console.log(`\n--- ID: ${log.id} | Topic: ${log.topic} ---`);
        console.log(`fullText length: ${log.fullText ? log.fullText.length : 'NULL'}`);
        if (log.fullText) {
            console.log("Snippet:", log.fullText.substring(0, 100).replace(/\n/g, ' '));
        } else {
            console.log("WARNING: fullText IS EMPTY!");
            // What about raw keys? Let's check via raw query if testo_integrale exists if fullText is failing mapping.
        }
    }
    
    // Explicit raw postgres test
    try {
        const rawLogs = await prisma.$queryRaw`SELECT id, testo_integrale FROM "FloremoriaLog" ORDER BY id DESC LIMIT 5`;
        console.log("\nRAW QUERY RESULT (testo_integrale direct fetching):");
        console.log(rawLogs);
    } catch(e) {
        console.error("Raw query error:", e);
    }
}

testQuery()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
