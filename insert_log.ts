import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const logs = await prisma.floremoriaLog.findMany();
    console.log("Current logs in DB:", logs.map(l => ({ id: l.id, topic: l.topic, date: l.sessionDate })));
    
    const barbaraLogExists = logs.some(l => l.topic && l.topic.includes('Barbara') || (l.shortSummary && l.shortSummary.includes('Barbara')));
    
    if (!barbaraLogExists) {
        console.log("Inserting verbale del 19/03 fornito da Barbara...");
        await prisma.floremoriaLog.create({
            data: {
                sessionDate: new Date('2026-03-19'),
                tag: 'VERBALE',
                topic: 'Verbale del 19/03 (Barbara)',
                shortSummary: 'Testo del verbale del 19/03 fornito da Barbara',
                keyPrompt: 'Dati richiesti inseriti.',
            }
        });
        console.log("Successfully inserted log.");
    } else {
        console.log("Verbale di Barbara already exists.");
    }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
