import { loadEnvFiles } from '../lib/loadEnvFiles';
import prisma from '../lib/prisma';

loadEnvFiles();

async function checkAllChannels() {
  console.log('🔍 VERIFICA CAMPAGNE PER TUTTI I SOCIAL...\n');

  const channels = ['META_INSTAGRAM', 'META_FACEBOOK', 'TIKTOK', 'LINKEDIN'];

  for (const channel of channels) {
    const campaigns = await prisma.marketingCampaign.findMany({
      where: { targetChannel: channel as any },
      orderBy: { updatedAt: 'desc' },
      take: 10
    });

    console.log(`=== CANALE: ${channel} (Trovati ${campaigns.length} record in totale) ===`);
    if (campaigns.length === 0) {
      console.log('Nessun record trovato.');
    } else {
      campaigns.forEach(c => {
        console.log(`- ID: ${c.id.slice(0, 8)}... | Stato: ${c.status} | ExternalID: ${c.externalId} | Modificato: ${c.updatedAt.toLocaleString('it-IT')}`);
      });
    }
    console.log('\n');
  }
}

checkAllChannels().catch(console.error);
