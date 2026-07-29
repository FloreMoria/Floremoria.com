const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    try {
        const logs = await prisma.floremoriaLog.findMany({
            where: {
                OR: [
                    { content: { contains: 'FT-PA-26-006', mode: 'insensitive' } },
                    { content: { contains: 'Luciano', mode: 'insensitive' } },
                    { content: { contains: 'cms3d3zua0001ld04sxzsni8e', mode: 'insensitive' } }
                ]
            },
            orderBy: { sessionDate: 'desc' }
        });

        console.log(`Trovati ${logs.length} log:`);
        console.log(JSON.stringify(logs, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

run();
