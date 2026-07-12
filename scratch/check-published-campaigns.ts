import { loadEnvFiles } from '../lib/loadEnvFiles';
import prisma from '../lib/prisma';

loadEnvFiles();

async function checkPublished() {
  console.log('🔍 VERIFICA CAMPAGNE PUBBLICATE SUL DATABASE...\n');

  const campaigns = await prisma.marketingCampaign.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: { updatedAt: 'desc' },
    take: 15
  });

  console.log(`Trovate ${campaigns.length} campagne con stato PUBLISHED negli ultimi inserimenti:\n`);
  
  for (const c of campaigns) {
    const isSimulated = c.externalId?.startsWith('simulated-') || !c.externalId;
    console.log(`- ID: ${c.id.slice(0, 8)}... | Social: ${c.targetChannel.padEnd(14)} | Stato: ${c.status} | ExternalID: ${c.externalId}`);
    console.log(`  Simulato? ${isSimulated ? '⚠️ SÌ (Simulazione)' : '✅ NO (Reale su Social)'}`);
    console.log(`  Data Aggiornamento: ${c.updatedAt.toLocaleString('it-IT')}`);
    console.log('----------------------------------------------------');
  }
}

checkPublished().catch(console.error);
