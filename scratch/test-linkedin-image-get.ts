import { loadEnvFiles } from '../lib/loadEnvFiles';
loadEnvFiles();

const token = process.env.LINKEDIN_ACCESS_TOKEN?.trim();
const testImage = 'urn:li:image:D4E10AQHnuf7AdlnDrA';

if (!token) {
  console.error('Missing LINKEDIN_ACCESS_TOKEN');
  process.exit(1);
}

async function testGet() {
  const url1 = `https://api.linkedin.com/v2/images/${encodeURIComponent(testImage)}`;
  try {
    const res1 = await fetch(url1, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Restli-Protocol-Version': '2.0.0',
      }
    });
    const data1 = await res1.json();
    console.log('RISPOSTA METODO 1 COMPLETA:');
    console.log(JSON.stringify(data1, null, 2));
  } catch (e) {
    console.error('Errore:', e);
  }
}

testGet().catch(console.error);
