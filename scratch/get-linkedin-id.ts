import { loadEnvFiles } from '../lib/loadEnvFiles';
loadEnvFiles();

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

loadEnvFiles();

// DIAGNOSTICA: Leggi il file .env.local direttamente per vedere se c'è discrepanza
let fileToken = '';
const envLocalPath = resolve(process.cwd(), '.env.local');
if (existsSync(envLocalPath)) {
  const content = readFileSync(envLocalPath, 'utf8');
  const match = content.match(/LINKEDIN_ACCESS_TOKEN\s*=\s*["']?([^"'\n]+)/);
  if (match && match[1]) {
    fileToken = match[1].trim();
  }
}

const token = process.env.LINKEDIN_ACCESS_TOKEN?.trim();

console.log('🔍 DIAGNOSTICA DI LOCAZIONE E VARIABILI:');
console.log(`- Token caricato in process.env:  "${token ? `${token.slice(0, 8)}...${token.slice(-8)}` : 'VUOTO'}" (Lunghezza: ${token?.length ?? 0})`);
console.log(`- Token scritto in .env.local:    "${fileToken ? `${fileToken.slice(0, 8)}...${fileToken.slice(-8)}` : 'VUOTO'}" (Lunghezza: ${fileToken?.length ?? 0})`);

if (token !== fileToken) {
  console.warn('⚠️ ATTENZIONE: Il token in memoria non coincide con quello scritto nel file .env.local!');
  console.warn('Questo può succedere se la variabile è stata impostata precedentemente nella sessione del terminale.');
  console.warn('Prova ad aprire una NUOVA scheda o finestra del terminale e riesegui lo script.');
}

if (!token) {
  console.error('❌ Errore: LINKEDIN_ACCESS_TOKEN non è impostato nel tuo file .env.local');
  process.exit(1);
}

async function getLinkedInId() {
  console.log('⏳ Interrogazione di LinkedIn API (v2/userinfo)...');
  try {
    const res = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${token}`,
      }
    });

    const data = await res.json();
    if (!res.ok) {
      console.error(`❌ Errore API LinkedIn (${res.status}):`, JSON.stringify(data, null, 2));
      process.exit(1);
    }

    const memberId = data.sub || data.id;

    console.log('\n✅ RICHIESTA EFFETTUATA CON SUCCESSO!');
    console.log('---------------------------------------------');
    console.log(`👤 Nome Profilo:  ${data.name || `${data.given_name} ${data.family_name}`}`);
    console.log(`🆔 ID Personale:  ${memberId}`);
    console.log(`🔗 URN Completo:  urn:li:person:${memberId}`);
    console.log('---------------------------------------------');
    console.log('\n💡 COSA FARE ADESSO:');
    console.log('Copia l\'URN Completo indicato sopra e inseriscilo nel tuo .env.local:');
    console.log(`LINKEDIN_USER_ID="urn:li:person:${memberId}"`);
  } catch (err) {
    console.error('❌ Errore di connessione:', err);
  }
}

getLinkedInId();
