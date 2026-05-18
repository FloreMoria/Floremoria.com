#!/usr/bin/env node
/**
 * Installa il JSON del service account GA4 in secrets/ e aggiorna .env.local
 *
 * Uso:
 *   npm run ga4:setup -- ~/Downloads/floremoria-xxxxx.json
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const secretsDir = resolve(root, 'secrets');
const destPath = resolve(secretsDir, 'ga4-service-account.json');
const envLocalPath = resolve(root, '.env.local');

const sourcePath = process.argv[2];
if (!sourcePath) {
    console.error(`
Uso: npm run ga4:setup -- /percorso/al/file-scaricato.json

Prima scarica la chiave da Google Cloud:
  1) console.cloud.google.com → progetto → API → abilita "Google Analytics Data API"
  2) IAM → Account di servizio → Crea → Chiavi → JSON
  3) analytics.google.com → Amministrazione → Gestione accessi proprietà
     → Aggiungi utente → email del service account → Visualizzatore
`);
    process.exit(1);
}

const absSource = resolve(sourcePath);
if (!existsSync(absSource)) {
    console.error('File non trovato:', absSource);
    process.exit(1);
}

let parsed;
try {
    parsed = JSON.parse(readFileSync(absSource, 'utf8'));
} catch {
    console.error('Il file non è JSON valido.');
    process.exit(1);
}

if (!parsed.client_email || !parsed.private_key || parsed.private_key.includes('MOCK')) {
    console.error('JSON non valido o file mock. Usa la chiave scaricata da Google Cloud.');
    process.exit(1);
}

mkdirSync(secretsDir, { recursive: true });
copyFileSync(absSource, destPath);
console.log('✓ Copiato in', destPath);

const envKeys = {
    NEXT_PUBLIC_GA_MEASUREMENT_ID: 'G-GVL7FSLBDK',
    GA4_PROPERTY_ID: process.env.GA4_PROPERTY_ID || '456714',
    NEXT_PUBLIC_GA4_PROPERTY_ID: process.env.GA4_PROPERTY_ID || '456714',
    GA4_CREDENTIALS_PATH: './secrets/ga4-service-account.json',
};

let envContent = existsSync(envLocalPath) ? readFileSync(envLocalPath, 'utf8') : '';

for (const [key, value] of Object.entries(envKeys)) {
    const line = `${key}="${value}"`;
    const re = new RegExp(`^${key}=.*$`, 'm');
    if (re.test(envContent)) {
        envContent = envContent.replace(re, line);
    } else {
        envContent += (envContent.endsWith('\n') || envContent.length === 0 ? '' : '\n') + line + '\n';
    }
}

writeFileSync(envLocalPath, envContent);
console.log('✓ Aggiornato .env.local');
console.log('\nProssimo passo: npm run ga4:verify');
console.log('\nPer Vercel: npm run ga4:vercel-env\n');
