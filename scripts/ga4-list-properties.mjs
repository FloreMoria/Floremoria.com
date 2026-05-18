#!/usr/bin/env node
/**
 * Elenca account e proprietà GA4 accessibili con OAuth (staff).
 * Uso: npm run ga4:list-properties
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OAuth2Client } from 'google-auth-library';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envLocalPath = resolve(root, '.env.local');

function loadEnvLocal() {
    if (!existsSync(envLocalPath)) return;
    for (const line of readFileSync(envLocalPath, 'utf8').split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const i = t.indexOf('=');
        if (i === -1) continue;
        const key = t.slice(0, i).trim();
        let val = t.slice(i + 1).trim();
        if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
        ) {
            val = val.slice(1, -1);
        }
        process.env[key] = val;
    }
}

loadEnvLocal();

const clientId = process.env.GA4_OAUTH_CLIENT_ID;
const clientSecret = process.env.GA4_OAUTH_CLIENT_SECRET;
const refreshToken = process.env.GA4_OAUTH_REFRESH_TOKEN;

if (!clientId || !clientSecret || !refreshToken) {
    console.error('Mancano GA4_OAUTH_* in .env.local. Esegui prima: npm run ga4:oauth-setup');
    process.exit(1);
}

const oauth2 = new OAuth2Client(clientId, clientSecret);
oauth2.setCredentials({ refresh_token: refreshToken });

const { token } = await oauth2.getAccessToken();
if (!token) {
    console.error('Impossibile ottenere access token OAuth.');
    process.exit(1);
}

const res = await fetch('https://analyticsadmin.googleapis.com/v1beta/accountSummaries', {
    headers: { Authorization: `Bearer ${token}` },
});

if (!res.ok) {
    const body = await res.text();
    console.error('Errore Admin API:', res.status, body.slice(0, 500));
    if (res.status === 403) {
        console.error('\nAbilita anche: Google Analytics Admin API');
        console.error('https://console.cloud.google.com/apis/library/analyticsadmin.googleapis.com?project=895357092367\n');
    }
    process.exit(1);
}

const data = await res.json();

console.log('\n=== Account e proprietà GA4 (usa ID PROPRIETÀ in GA4_PROPERTY_ID) ===\n');

for (const account of data.accountSummaries || []) {
    const accountId = account.account?.replace('accounts/', '') || '?';
    console.log(`Account: ${account.displayName}`);
    console.log(`  ID account (NON usare in GA4_PROPERTY_ID): ${accountId}\n`);

    for (const prop of account.propertySummaries || []) {
        const propertyId = prop.property?.replace('properties/', '') || '?';
        console.log(`  Proprietà: ${prop.displayName}`);
        console.log(`  → GA4_PROPERTY_ID="${propertyId}"`);
        console.log('');
    }
}

console.log('Copia GA4_PROPERTY_ID della riga "FloreMoria" in .env.local e su Vercel, poi: npm run ga4:verify\n');
