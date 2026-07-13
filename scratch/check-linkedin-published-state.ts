import { loadEnvFiles } from '../lib/loadEnvFiles';
import prisma from '../lib/prisma';

loadEnvFiles();

async function checkLinkedIn() {
  console.log('🔍 CONTROLLO STATO CAMPAGNE LINKEDIN...');
  const campaigns = await prisma.marketingCampaign.findMany({
    where: { targetChannel: 'LINKEDIN' },
    orderBy: { updatedAt: 'desc' },
    take: 5
  });

  for (const c of campaigns) {
    console.log(`- ID: ${c.id.slice(0, 8)}... | Stato: ${c.status} | ExternalID: ${c.externalId} | Errore: ${c.rejectionReason || 'nessuno'} | Aggiornato: ${c.updatedAt.toLocaleString('it-IT')}`);
  }
}

checkLinkedIn().catch(console.error);
