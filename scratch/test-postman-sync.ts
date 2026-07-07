import { loadEnvFiles } from '../lib/loadEnvFiles';
loadEnvFiles();

const base = process.argv[2]?.trim() || 'http://localhost:3000';
const secret =
    process.env.POSTMAN_CRON_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.ASSISTENZA_EMAIL_WEBHOOK_SECRET?.trim();

if (!secret) {
    console.error('POSTMAN_CRON_SECRET mancante');
    process.exit(1);
}

async function run() {
    const url = `${base.replace(/\/$/, '')}/api/cron/postman-sync`;
    console.log(`GET ${url}`);
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${secret}` },
    });
    const text = await res.text();
    console.log(`status=${res.status}`);
    try {
        console.log(JSON.stringify(JSON.parse(text), null, 2));
    } catch {
        console.log(text.slice(0, 800));
    }
}

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
