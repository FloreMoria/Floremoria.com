#!/usr/bin/env node
/**
 * Stampa le variabili da incollare in Vercel (senza committare segreti).
 * Uso: npm run ga4:vercel-env
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const credPath =
    process.argv[2] || resolve(root, 'secrets/ga4-service-account.json');

if (!existsSync(credPath)) {
    console.error('File credenziali non trovato:', credPath);
    console.error('Esegui prima: npm run ga4:setup -- /percorso/chiave.json');
    process.exit(1);
}

const json = readFileSync(credPath, 'utf8').trim();
const propertyId = process.env.GA4_PROPERTY_ID || '456714';

console.log(`
=== Incolla in Vercel → Project → Settings → Environment Variables ===

GA4_PROPERTY_ID
${propertyId}

NEXT_PUBLIC_GA4_PROPERTY_ID
${propertyId}

NEXT_PUBLIC_GA_MEASUREMENT_ID
G-GVL7FSLBDK

GA4_SERVICE_ACCOUNT_JSON
(incolla l'intero JSON su UNA riga — opzione sotto)

--- opzione GA4_SERVICE_ACCOUNT_JSON (una riga) ---
`);
console.log(JSON.stringify(JSON.parse(json)));

console.log(`
=== Poi: Redeploy ===
`);
