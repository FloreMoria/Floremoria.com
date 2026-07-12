import { loadEnvFiles } from '../lib/loadEnvFiles';
import prisma from '../lib/prisma';
import { linkedInRegisterImageUpload } from '../lib/postman/socialPublish'; // wait, it is not exported, we can define it inline

loadEnvFiles();

const token = process.env.LINKEDIN_ACCESS_TOKEN?.trim();
const rawUserId = process.env.LINKEDIN_USER_ID?.trim() || '';
const memberId = rawUserId.replace(/^urn:li:(person|member):/, '');

if (!token) {
  console.error('Missing LINKEDIN_ACCESS_TOKEN');
  process.exit(1);
}

async function testUrn(urn: string) {
  console.log(`\n-------------------------------------`);
  console.log(`🧪 TEST CON URN: "${urn}"`);
  console.log(`-------------------------------------`);

  try {
    // 1. Prova a registrare l'upload dell'immagine per questo autore
    console.log('1. Registrazione upload immagine...');
    const regRes = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        registerUploadRequest: {
          owner: urn,
          recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
          serviceRelationships: [
            {
              relationshipType: 'OWNER',
              identifier: 'urn:li:userGeneratedContent',
            },
          ],
        },
      }),
    });

    const regData = await regRes.json();
    if (!regRes.ok) {
      console.log(`❌ Registrazione fallita (${regRes.status}):`, regData.message || JSON.stringify(regData));
      return;
    }

    console.log('✅ Registrazione riuscita! Asset:', regData.value?.asset);

    // 2. Prova a pubblicare un post di test con questo autore
    console.log('2. Invio post di test...');
    const postRes = await fetch('https://api.linkedin.com/v2/posts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        author: urn,
        commentary: 'Test post da FloreMoria API URN validation.',
        visibility: 'PUBLIC',
        distribution: {
          feedDistribution: 'MAIN_FEED',
        },
        lifecycleState: 'PUBLISHED',
      }),
    });

    const postText = await postRes.text();
    console.log(`Post status = ${postRes.status}`);
    console.log(`Risposta:`, postText);

    if (postRes.ok) {
      console.log('🎉 SUCCESSO REALIZZATO per URN:', urn);
    } else {
      console.log('❌ Post fallito:', postText);
    }
  } catch (err) {
    console.error('Errore durante il test:', err);
  }
}

async function run() {
  console.log(`Member ID estratto: ${memberId}`);
  
  // Testiamo le varianti principali
  await testUrn(`urn:li:person:${memberId}`);
  await testUrn(`urn:li:member:${memberId}`);
  await testUrn(`urn:li:person:NhSHqkrEHN`); // con ID specifico del nuovo token se diverso
  await testUrn(`urn:li:member:NhSHqkrEHN`);
}

run().catch(console.error);
