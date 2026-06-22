/**
 * Diagnostica token PIT + Location ID Futuria/GHL.
 * Uso: npx tsx scripts/futuria-diagnose-location.ts
 */
import { loadEnvFiles } from '../lib/loadEnvFiles';

loadEnvFiles();

const API_KEY = process.env.FUTURIA_API_KEY?.trim();
const LOCATION_ID = process.env.FUTURIA_LOCATION_ID?.trim();
const BASE = process.env.FUTURIA_API_BASE_URL?.trim() || 'https://services.leadconnectorhq.com';
const VERSION = process.env.FUTURIA_API_VERSION?.trim() || '2021-07-28';

const TEST_PHONE = '+393111111114';
const TEST_EMAIL = 'fioristanuovo314@pec.it';

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
    return { status: res.status, ok: res.ok, text, json: text ? tryParse(text) : null };
}

function tryParse(text: string) {
    try {
        return JSON.parse(text);
    } catch {
        return text.slice(0, 500);
    }
}

async function main() {
    console.log('=== Futuria Location / Token Diagnostics ===\n');
    console.log('FUTURIA_LOCATION_ID:', LOCATION_ID || '(mancante)');
    console.log('FUTURIA_API_KEY prefix:', API_KEY ? `${API_KEY.slice(0, 8)}…` : '(mancante)');
    console.log('API base:', BASE);
    console.log('');

    if (!API_KEY || !LOCATION_ID) {
        console.error('Mancano FUTURIA_API_KEY o FUTURIA_LOCATION_ID in .env.local');
        process.exit(1);
    }

    // 1) GET location by ID
    console.log('--- 1) GET /locations/{locationId} ---');
    const loc = await api(`/locations/${LOCATION_ID}`, { method: 'GET' });
    console.log('HTTP', loc.status);
    console.log(JSON.stringify(loc.json, null, 2)?.slice(0, 2000));
    console.log('');

    // 2) locations/search (agency token sometimes)
    console.log('--- 2) GET /locations/search (se permesso) ---');
    const locSearch = await api('/locations/search?limit=20', { method: 'GET' });
    console.log('HTTP', locSearch.status);
    if (locSearch.ok && locSearch.json && typeof locSearch.json === 'object') {
        const locations = (locSearch.json as { locations?: unknown[] }).locations ?? locSearch.json;
        console.log(JSON.stringify(locations, null, 2)?.slice(0, 2500));
    } else {
        console.log(locSearch.text?.slice(0, 400));
    }
    console.log('');

    // 3) Duplicate search for test contact
    console.log('--- 3) GET /contacts/search/duplicate (phone) ---');
    const dupPhone = await api(
        `/contacts/search/duplicate?locationId=${encodeURIComponent(LOCATION_ID)}&number=${encodeURIComponent(TEST_PHONE)}`,
        { method: 'GET' }
    );
    console.log('HTTP', dupPhone.status);
    console.log(JSON.stringify(dupPhone.json, null, 2)?.slice(0, 1500));
    const contactIdFromPhone = (dupPhone.json as { contact?: { id?: string } })?.contact?.id;
    console.log('');

    console.log('--- 4) GET /contacts/search/duplicate (email) ---');
    const dupEmail = await api(
        `/contacts/search/duplicate?locationId=${encodeURIComponent(LOCATION_ID)}&email=${encodeURIComponent(TEST_EMAIL)}`,
        { method: 'GET' }
    );
    console.log('HTTP', dupEmail.status);
    console.log(JSON.stringify(dupEmail.json, null, 2)?.slice(0, 1500));
    const contactIdFromEmail = (dupEmail.json as { contact?: { id?: string } })?.contact?.id;
    console.log('');

    const contactId = contactIdFromPhone || contactIdFromEmail;
    if (contactId) {
        console.log('--- 5) GET /contacts/{contactId} ---');
        const contact = await api(`/contacts/${contactId}`, { method: 'GET' });
        console.log('HTTP', contact.status);
        console.log(JSON.stringify(contact.json, null, 2)?.slice(0, 2500));
        console.log('');

        console.log('--- 6) POST /contacts/search (advanced, locationId filter) ---');
        const searchBody = {
            locationId: LOCATION_ID,
            page: 1,
            pageLimit: 5,
            filters: [{ field: 'email', operator: 'eq', value: TEST_EMAIL }],
        };
        const advSearch = await api('/contacts/search', {
            method: 'POST',
            body: JSON.stringify(searchBody),
        });
        console.log('HTTP', advSearch.status);
        console.log(JSON.stringify(advSearch.json, null, 2)?.slice(0, 2000));
    } else {
        console.log('⚠ Contatto test non trovato via duplicate search — upsert potrebbe non aver persistito o location diversa.');
    }

    console.log('\n=== Fine diagnostica ===');
    console.log('\nConfronta FUTURIA_LOCATION_ID con l\'URL browser:');
    console.log('  https://app.gohighlevel.com/location/<QUESTO_ID>/contacts');
    console.log('  oppure dominio Futuria equivalente con /location/...');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
