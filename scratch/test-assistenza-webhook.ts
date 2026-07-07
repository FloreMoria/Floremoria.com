/**
 * Test end-to-end POSTMAN assistenza (locale o produzione).
 * Uso: npx tsx scratch/test-assistenza-webhook.ts [baseUrl] [fromEmail] [fromName]
 */
import { loadEnvFiles } from '../lib/loadEnvFiles';
loadEnvFiles();

const base =
    process.argv[2]?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    'http://localhost:3000';

const secret = process.env.ASSISTENZA_EMAIL_WEBHOOK_SECRET?.trim();
if (!secret) {
    console.error('ASSISTENZA_EMAIL_WEBHOOK_SECRET mancante');
    process.exit(1);
}

const testId = `test-${Date.now()}@floremoria-e2e.local`;
const payload = {
    fromEmail: process.argv[3]?.trim() || 'cliente.test@example.com',
    fromName: process.argv[4]?.trim() || 'Cliente Test E2E',
    subject: `Test assistenza ${testId}`,
    text: 'Buongiorno, vorrei informazioni sui fiori per una tomba a Milano. Grazie.',
    messageId: `<${testId}>`,
};

async function run() {
    const url = `${base.replace(/\/$/, '')}/api/webhooks/assistenza-email`;

    console.log(`GET ${url}`);
    const getRes = await fetch(url);
    const getText = await getRes.text();
    console.log(`GET status=${getRes.status}`);
    try {
        console.log(JSON.stringify(JSON.parse(getText), null, 2));
    } catch {
        console.log(getText.slice(0, 200));
    }

    console.log(`\nPOST ${url} (generic payload)`);
    const postRes = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${secret}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
    const postText = await postRes.text();
    console.log(`POST status=${postRes.status}`);
    try {
        console.log(JSON.stringify(JSON.parse(postText), null, 2));
    } catch {
        console.log(postText.slice(0, 500));
    }

    if (!postRes.ok) process.exit(1);
}

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
