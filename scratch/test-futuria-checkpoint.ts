/**
 * Test temporaneo — checkpoint Guardiani Futuria (ALMA, SOFIA, MARTINA, BARBARA, PROF).
 *
 * Uso: npx tsx scratch/test-futuria-checkpoint.ts
 */
import { loadEnvFiles } from '../lib/loadEnvFiles';
import prisma from '../lib/prisma';
import { evaluateCampaignDraft } from '../lib/futuria/engine/checkpoint';

loadEnvFiles();

const CAMPAIGN_ID = 'cmr0v7ozy00006dqden9brn9u';

const GUARDIAN_LABELS: Record<string, string> = {
  alma: 'ALMA (Psicologia del Lutto)',
  sofia: 'SOFIA (Etica e Dignità)',
  martina: 'MARTINA (Verità Botanica)',
  barbara: 'BARBARA (Legal & Compliance)',
  prof: 'PROF (Correttezza Formale)',
};

function printGuardianReports(
  reports: NonNullable<Awaited<ReturnType<typeof evaluateCampaignDraft>>['reports']>
) {
  console.log('\n📋 Report singoli Guardiani:\n');
  for (const [key, label] of Object.entries(GUARDIAN_LABELS)) {
    const report = reports[key as keyof typeof reports];
    const icon = report.passed ? '✅' : '❌';
    console.log(`${icon} ${label}`);
    console.log(`   Esito: ${report.passed ? 'PASSED' : 'FAILED'}`);
    console.log(`   Feedback: ${report.feedback}\n`);
  }
}

async function main() {
  console.log('🛡️  Futuria — test Checkpoint Guardiani');
  console.log(`   Campaign ID: ${CAMPAIGN_ID}\n`);

  const before = await prisma.marketingCampaign.findUnique({
    where: { id: CAMPAIGN_ID },
    select: {
      id: true,
      status: true,
      targetChannel: true,
      category: true,
      rejectionReason: true,
    },
  });

  if (!before) {
    console.error(`❌ Campagna ${CAMPAIGN_ID} non trovata.`);
    process.exit(1);
  }

  console.log('📋 Stato iniziale:');
  console.log(`   channel: ${before.targetChannel}`);
  console.log(`   category: ${before.category}`);
  console.log(`   status: ${before.status}`);
  if (before.rejectionReason) {
    console.log(`   rejectionReason: ${before.rejectionReason}`);
  }
  console.log('\n→ Invocazione evaluateCampaignDraft…\n');

  const startedAt = Date.now();
  const result = await evaluateCampaignDraft(CAMPAIGN_ID);
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);

  const after = await prisma.marketingCampaign.findUnique({
    where: { id: CAMPAIGN_ID },
    select: { status: true, rejectionReason: true, updatedAt: true },
  });

  console.log(`⏱️  Checkpoint completato in ${elapsedSec}s\n`);
  console.log('═══════════════════════════════════════');
  console.log(`   ESITO FINALE: ${result.approved ? '✅ APPROVED' : '❌ REJECTED'}`);
  console.log(`   Stato Prisma: ${after?.status ?? 'N/D'}`);
  if (after?.rejectionReason) {
    console.log(`   Motivo rifiuto (DB): ${after.rejectionReason}`);
  }
  if (result.reason && !result.approved) {
    console.log(`   Motivo rifiuto (engine): ${result.reason}`);
  }
  console.log('═══════════════════════════════════════');

  if (result.reports) {
    printGuardianReports(result.reports);
  } else {
    console.log(
      '\nℹ️  Report Guardiani non disponibili (campagna già APPROVED/PUBLISHED — checkpoint saltato).'
    );
  }

  if (after?.updatedAt) {
    console.log(`🕐 updatedAt: ${after.updatedAt.toISOString()}`);
  }
}

main()
  .catch((err) => {
    console.error('❌ Errore test Futuria Checkpoint:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
