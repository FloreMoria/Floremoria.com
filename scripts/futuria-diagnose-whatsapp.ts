/**
 * Diagnostica invio WhatsApp Futuria — SOLO SVILUPPO.
 * Non inviare mai messaggi di test in produzione senza FUTURIA_DIAGNOSE_ALLOW=1.
 */
import { loadEnvFiles } from '../lib/loadEnvFiles';

loadEnvFiles();

if (process.env.FUTURIA_DIAGNOSE_ALLOW !== '1') {
    console.error(
        'Script diagnostico disabilitato. Per test manuali: FUTURIA_DIAGNOSE_ALLOW=1 npx tsx scripts/futuria-diagnose-whatsapp.ts'
    );
    process.exit(1);
}

const API_KEY = process.env.FUTURIA_API_KEY?.trim();
const LOCATION_ID = process.env.FUTURIA_LOCATION_ID?.trim();
const BASE = process.env.FUTURIA_API_BASE_URL?.trim() || 'https://services.leadconnectorhq.com';
const VERSION = process.env.FUTURIA_API_VERSION?.trim() || '2021-07-28';
const PHONE = process.argv[2]?.trim() || '+393204105305';
const MESSAGE_ID = process.argv[3]?.trim();

async function api(path: string, init: RequestInit = {}) {
    const res = await fetch(`${BASE}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${API_KEY}`,
            Accept: 'application/json',
            Version: VERSION,
            ...(init.body ? { 'Content-Type': 'application/json' } : {}),
            ...(init.headers || {}),
        },
    });
    const text = await res.text();
    return { status: res.status, text, json: text ? JSON.parse(text) : null };
}

async function main() {
    if (!API_KEY || !LOCATION_ID) {
        console.error('FUTURIA_API_KEY / FUTURIA_LOCATION_ID mancanti');
        process.exit(1);
    }

    if (MESSAGE_ID) {
        console.log('→ GET message status:', MESSAGE_ID);
        const msg = await api(`/conversations/messages/${MESSAGE_ID}`);
        console.log(JSON.stringify(msg, null, 2));
        return;
    }

    console.log('→ Upsert contatto', PHONE);
    const upsert = await api('/contacts/upsert', {
        method: 'POST',
        body: JSON.stringify({
            locationId: LOCATION_ID,
            phone: PHONE,
            firstName: 'Test',
            lastName: 'FloreMoria',
            email: 'test-proof@floremoria.com',
        }),
    });
    console.log('Upsert:', upsert.status, JSON.stringify(upsert.json, null, 2));

    const contactId = upsert.json?.contact?.id || upsert.json?.id;
    if (!contactId) {
        console.error('Nessun contactId');
        process.exit(1);
    }

    const shortMsg = '⚠ TEST DEV ONLY — ignorare. Script diagnostico FloreMoria.';

    console.log('\n→ POST /conversations/messages (WhatsApp freetext)');
    const send1 = await api('/conversations/messages', {
        method: 'POST',
        body: JSON.stringify({
            type: 'WhatsApp',
            contactId,
            message: shortMsg,
            toNumber: PHONE,
        }),
    });
    console.log('Send freetext:', send1.status, JSON.stringify(send1.json, null, 2));

    const templateId = process.env.FUTURIA_WHATSAPP_TEMPLATE_ID?.trim();
    if (templateId) {
        console.log('\n→ POST /conversations/messages (WhatsApp template)');
        const send2 = await api('/conversations/messages', {
            method: 'POST',
            body: JSON.stringify({
                type: 'WhatsApp',
                contactId,
                templateId,
                toNumber: PHONE,
            }),
        });
        console.log('Send template:', send2.status, JSON.stringify(send2.json, null, 2));
    } else {
        console.log('\n(Salta test template: FUTURIA_WHATSAPP_TEMPLATE_ID non impostato)');
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
