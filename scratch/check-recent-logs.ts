import { PrismaClient } from '@prisma/client';

async function main() {
    const prisma = new PrismaClient();
    try {
        console.log('📋 Reading recent FloremoriaLog entries...');
        const logs = await prisma.floremoriaLog.findMany({
            orderBy: { sessionDate: 'desc' },
            take: 10
        });
        
        console.log(`Found ${logs.length} entries:`);
        for (const log of logs) {
            console.log(`\n--------------------------------------------`);
            console.log(`🆔 ID: ${log.id}`);
            console.log(`📅 Date: ${log.sessionDate.toISOString().split('T')[0]}`);
            console.log(`🏷️ Tag: ${log.tag}`);
            console.log(`📌 Topic: ${log.topic}`);
            console.log(`📝 Summary: ${log.shortSummary}`);
            console.log(`💬 FullText Length: ${log.fullText?.length || 0}`);
        }
    } catch (err) {
        console.error('Error querying logs:', err);
    } finally {
        await prisma.$disconnect();
    }
}

main();
