/**
 * Test temporaneo — generazione immagine Imagen + upload Vercel Blob (Futuria).
 *
 * Uso: npx tsx scratch/test-futuria-images.ts
 */
import { loadEnvFiles } from '../lib/loadEnvFiles';
import prisma from '../lib/prisma';
import { generateAndStorageCampaignImage } from '../lib/futuria/engine/images';

loadEnvFiles();

const CAMPAIGN_ID = 'cmr0v7ozy00006dqden9brn9u';

async function main() {
  console.log('🖼️  Futuria — test generazione immagine');
  console.log(`   Campaign ID: ${CAMPAIGN_ID}\n`);

  const before = await prisma.marketingCampaign.findUnique({
    where: { id: CAMPAIGN_ID },
    select: {
      id: true,
      targetChannel: true,
      category: true,
      status: true,
      imageUrl: true,
      imagePrompt: true,
      copy: true,
    },
  });

  if (!before) {
    console.error(`❌ Campagna ${CAMPAIGN_ID} non trovata nel database.`);
    process.exit(1);
  }

  console.log('📋 Stato iniziale campagna:');
  console.log(`   channel: ${before.targetChannel}`);
  console.log(`   category: ${before.category}`);
  console.log(`   status: ${before.status}`);
  console.log(`   imageUrl: "${before.imageUrl || ''}"`);
  console.log(
    `   imagePrompt: ${before.imagePrompt?.trim() ? `${before.imagePrompt.slice(0, 120)}…` : '(fallback da copy)'}`
  );
  console.log('');

  console.log('→ [1/3] Chiamata Imagen (Gemini) in corso…');

  const startedAt = Date.now();
  const url = await generateAndStorageCampaignImage(CAMPAIGN_ID);
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log(`✅ [1/3] Imagen completata (${elapsedSec}s)`);
  console.log('→ [2/3] Upload Vercel Blob (futuria/campagne/) completato');
  console.log(`   URL privato blob: ${url}`);
  console.log('→ [3/3] Verifica persistenza Prisma…');

  const after = await prisma.marketingCampaign.findUnique({
    where: { id: CAMPAIGN_ID },
    select: { imageUrl: true, updatedAt: true },
  });

  if (!after?.imageUrl?.trim()) {
    console.error('❌ imageUrl non aggiornato su marketing_campaigns.');
    process.exit(1);
  }

  if (after.imageUrl !== url) {
    console.warn('⚠️  URL restituito dalla funzione diverso da quello in DB.');
    console.warn(`   funzione: ${url}`);
    console.warn(`   database: ${after.imageUrl}`);
  }

  console.log('✅ [3/3] imageUrl salvato nel database');
  console.log(`\n🎯 URL privato finale (DB): ${after.imageUrl}`);
  console.log(`   updatedAt: ${after.updatedAt.toISOString()}`);
}

main()
  .catch((err) => {
    console.error('❌ Errore test Futuria Images:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
