/**
 * Sandbox — test sul campo del Core Creativo Futuria (generateCampaignDraft).
 *
 * Uso: npx tsx scratch/sandbox-futuria-test.ts
 */
import { CampaignStatus } from '@prisma/client';
import { loadEnvFiles } from '../lib/loadEnvFiles';
import prisma from '../lib/prisma';
import {
  FuturiaEngineConfigError,
  generateCampaignDraft,
} from '../lib/futuria/engine/generation';

loadEnvFiles();

const PRODUCT_NAME = 'Bouquet Ricordo Affettuoso';
const PRODUCT_PRICE = 29.99;
const CATEGORY = 'FT' as const;

async function main() {
  const startedAt = new Date();

  console.log('🌸 Futuria Sandbox — Core Creativo');
  console.log(`   Prodotto: ${PRODUCT_NAME}`);
  console.log(`   Prezzo: €${PRODUCT_PRICE.toFixed(2)}`);
  console.log(`   Categoria: ${CATEGORY} (Fiori sulle Tombe)\n`);

  let result;
  try {
    result = await generateCampaignDraft(CATEGORY, PRODUCT_NAME, PRODUCT_PRICE);
  } catch (e) {
    if (e instanceof FuturiaEngineConfigError) {
      console.error('❌ Configurazione mancante:', e.message);
      console.error('   Imposta GEMINI_API_KEY in .env.local e riprova.');
      process.exit(1);
    }
    throw e;
  }

  console.log('✅ Risposta generateCampaignDraft (JSON):\n');
  console.log(JSON.stringify(result, null, 2));

  const drafts = await prisma.marketingCampaign.findMany({
    where: {
      status: CampaignStatus.DRAFT,
      category: CATEGORY,
      createdAt: { gte: startedAt },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      status: true,
      category: true,
      targetChannel: true,
      copy: true,
      hashtags: true,
      imageUrl: true,
      createdAt: true,
    },
  });

  console.log('\n📋 Verifica Prisma — marketing_campaigns (DRAFT, creati in questa run):\n');

  if (drafts.length === 0) {
    console.error('❌ Nessun record DRAFT trovato per questa esecuzione.');
    process.exit(1);
  }

  console.log(`   Trovati ${drafts.length} record (attesi: ${result.posts.length})\n`);

  for (const row of drafts) {
    console.log(`   • ${row.id}`);
    console.log(`     channel: ${row.targetChannel} | status: ${row.status}`);
    console.log(`     hashtags: [${row.hashtags.join(', ')}]`);
    console.log(`     imageUrl: "${row.imageUrl}" (placeholder atteso)`);
    console.log(`     copy: ${row.copy.slice(0, 80)}${row.copy.length > 80 ? '…' : ''}`);
    console.log('');
  }

  const channelsOk = result.posts.every((post) =>
    drafts.some((d) => d.targetChannel === post.channel && d.copy === post.copy)
  );

  if (drafts.length === result.posts.length && channelsOk) {
    console.log('✅ Prisma OK: tutti i post generati sono stati persistiti in DRAFT.');
  } else {
    console.warn('⚠️  Disallineamento tra post restituiti e record DB — controllare i log sopra.');
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('❌ Errore sandbox Futuria:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
