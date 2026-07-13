import { loadEnvFiles } from '../lib/loadEnvFiles';
loadEnvFiles();

const token = process.env.LINKEDIN_ACCESS_TOKEN?.trim();
const rawUserId = process.env.LINKEDIN_USER_ID?.trim() || '';
const authorUrn = `urn:li:person:${rawUserId.replace(/^urn:li:(person|member):/, '')}`;

if (!token) {
  console.error('Missing LINKEDIN_ACCESS_TOKEN');
  process.exit(1);
}

async function testImagesApi() {
  console.log('🧪 TEST COMPLETATO NUOVA IMAGES API DI LINKEDIN...');
  console.log(`Autore URN: "${authorUrn}"`);

  // 1. Inizializza l'upload dell'immagine
  console.log('1. Chiamata initializeUpload su /v2/images...');
  const initRes = await fetch('https://api.linkedin.com/v2/images?action=initializeUpload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      initializeUploadRequest: {
        owner: authorUrn,
      },
    }),
  });

  const initData = await initRes.json();
  if (!initRes.ok) {
    console.error(`❌ Inizializzazione fallita (${initRes.status}):`, initData);
    return;
  }

  const uploadUrl = initData.value?.uploadUrl;
  const imageUrn = initData.value?.image;
  console.log('✅ Inizializzato! Image URN:', imageUrn);
  console.log('Upload URL:', uploadUrl);

  if (!uploadUrl || !imageUrn) {
    console.error('Dati mancanti!');
    return;
  }

  // 2. Simuliamo il caricamento di un'immagine di test (1px trasparente)
  console.log('2. Caricamento byte immagine su uploadUrl...');
  const png1px = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'image/png',
    },
    body: png1px,
  });

  if (!uploadRes.ok) {
    console.error(`❌ Upload fallito (${uploadRes.status})`);
    return;
  }
  console.log('✅ Caricamento completato con successo!');

  // 3. Polling dello stato dell'immagine
  const rawImageId = imageUrn.replace(/^urn:li:image:/, '');
  console.log(`3. Polling stato immagine su /v2/images/${rawImageId}...`);
  let isReady = false;
  for (let i = 0; i < 8; i++) {
    const checkRes = await fetch(`https://api.linkedin.com/v2/images/${rawImageId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Restli-Protocol-Version': '2.0.0',
      },
    });

    if (checkRes.ok) {
      const checkData = await checkRes.json();
      console.log(`Tentativo ${i + 1}/8 - Stato: "${checkData.status}"`);
      if (checkData.status === 'AVAILABLE') {
        isReady = true;
        break;
      }
    } else {
      console.warn(`Errore polling HTTP ${checkRes.status}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  if (!isReady) {
    console.error('❌ L\'immagine non è diventata AVAILABLE in tempo.');
    return;
  }

  // 4. Creiamo il post
  console.log('4. Invio post a /v2/posts...');
  const postRes = await fetch('https://api.linkedin.com/v2/posts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: authorUrn,
      commentary: 'Test post con la nuova Images API di LinkedIn da FloreMoria.',
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
      },
      content: {
        media: {
          id: imageUrn,
        },
      },
      lifecycleState: 'PUBLISHED',
    }),
  });

  const postText = await postRes.text();
  console.log(`Status Invio Post: ${postRes.status}`);
  console.log(`Risposta:`, postText);

  if (postRes.ok) {
    console.log('🎉 EVENTO COMPLETATO CON SUCCESSO! Il post è live su LinkedIn!');
  } else {
    console.error('❌ Invio post fallito.');
  }
}

testImagesApi().catch(console.error);
