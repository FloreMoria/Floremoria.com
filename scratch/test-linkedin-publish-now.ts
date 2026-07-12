import { loadEnvFiles } from '../lib/loadEnvFiles';
import prisma from '../lib/prisma';
import { publishCampaignToChannel } from '../lib/postman/socialPublish';

loadEnvFiles();

async function testLinkedInPublish() {
  console.log('=== TEST DI PUBBLICAZIONE REALE SU LINKEDIN ===\n');

  // Trova una campagna LinkedIn APPROVED nel database
  const campaign = await prisma.marketingCampaign.findFirst({
    where: {
      targetChannel: 'LINKEDIN',
      status: 'APPROVED'
    }
  });

  if (!campaign) {
    console.error('❌ Nessuna campagna LinkedIn in stato APPROVED trovata nel database.');
    return;
  }

  console.log(`Trovata campagna APPROVED: ${campaign.id}`);
  console.log(`Copy: "${campaign.copy.slice(0, 100)}..."`);
  console.log(`Immagine: ${campaign.imageUrl}`);
  
  console.log('\n⏳ Invio pubblicazione su LinkedIn...');
  const result = await publishCampaignToChannel({
    id: campaign.id,
    targetChannel: 'LINKEDIN',
    copy: campaign.copy,
    hashtags: campaign.hashtags,
    imageUrl: campaign.imageUrl || ''
  });

  console.log('\n📊 RISULTATO PUBBLICAZIONE:');
  console.log(JSON.stringify(result, null, 2));

  if (result.success) {
    console.log('\n✅ Pubblicazione riuscita!');
    if (result.simulated) {
      console.log('⚠️ ATTENZIONE: La pubblicazione è stata SIMULATA (le credenziali non erano pronte o caricate).');
    }
  } else {
    console.log('\n❌ Pubblicazione FALLITA.');
    console.log(`Errore: ${result.error}`);
  }
}

testLinkedInPublish().catch(console.error);
