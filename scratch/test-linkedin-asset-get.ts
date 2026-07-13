import { loadEnvFiles } from '../lib/loadEnvFiles';
loadEnvFiles();

const token = process.env.LINKEDIN_ACCESS_TOKEN?.trim();
const testAsset = 'urn:li:digitalmediaAsset:D4E22AQHqpOKy7o_Jbg';
const rawId = testAsset.replace(/^urn:li:digitalmediaAsset:/, '');

if (!token) {
  console.error('Missing LINKEDIN_ACCESS_TOKEN');
  process.exit(1);
}

async function testGet() {
  const url1 = `https://api.linkedin.com/v2/assets/${rawId}`;
  console.log(`🧪 Test GET ${url1}`);
  try {
    const res1 = await fetch(url1, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Restli-Protocol-Version': '2.0.0',
      }
    });
    console.log(`Status: ${res1.status}`);
    const data1 = await res1.text();
    console.log(`Risposta:`, data1);
  } catch (e) {
    console.error('Errore:', e);
  }
}

testGet().catch(console.error);
