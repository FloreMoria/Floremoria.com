import prisma from '../lib/prisma';

async function main() {
  const log = await prisma.floremoriaLog.findUnique({
    where: { id: 204 },
  });

  if (!log) {
    console.log('Log 204 non trovato.');
    return;
  }

  console.log('--- LOG 204 COMPLETO ---');
  console.log('ID:', log.id);
  console.log('SessionDate:', log.sessionDate);
  console.log('Tag:', log.tag);
  console.log('Topic:', log.topic);
  console.log('ShortSummary:', log.shortSummary);
  console.log('KeyPrompt:', log.keyPrompt);
  console.log('DiscussedPoints:', log.discussedPoints);
  console.log('AchievedResults:', log.achievedResults);
  console.log('\n--- FULL TEXT ---');
  console.log(log.fullText);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
