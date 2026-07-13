import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFiles } from '../lib/loadEnvFiles';
import { runMarketingProductionPipeline } from '../lib/marketing/engine/pipeline';

// 1. Carica le variabili locali (.env.local) per avere chiavi API come GEMINI_API_KEY
loadEnvFiles();

// Salviamo il preset passato da riga di comando per evitare che venga sovrascritto
const shellDatabaseUrl = process.env.DATABASE_URL;

// 2. Leggiamo .env.production.local se presente
const prodEnvPath = resolve(process.cwd(), '.env.production.local');
if (existsSync(prodEnvPath)) {
  const content = readFileSync(prodEnvPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (val) {
      process.env[key] = val;
    }
  }
}

// 3. Ripristiniamo la DATABASE_URL passata via shell se presente (ha priorità massima)
if (shellDatabaseUrl) {
  process.env.DATABASE_URL = shellDatabaseUrl;
}

async function triggerPipeline() {
  console.log('🚀 AVVIO PIPELINE GENERAZIONE MARKETING...');
  const targetDb = process.env.DATABASE_URL || '';
  const isNeon = targetDb.includes('neon.tech');
  console.log(`Database target: "${isNeon ? 'PRODUZIONE (Neon)' : 'LOCALE (localhost)'}"`);
  
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ Errore: GEMINI_API_KEY non configurata nei file .env!');
    process.exit(1);
  }

  try {
    const summary = await runMarketingProductionPipeline();
    console.log('\n📊 PIPELINE COMPLETATA!');
    console.log(JSON.stringify(summary, null, 2));
  } catch (err) {
    console.error('❌ Errore durante l\'esecuzione della pipeline:', err);
  }
}

triggerPipeline().catch(console.error);
