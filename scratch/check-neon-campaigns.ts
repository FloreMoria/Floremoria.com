import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFiles } from '../lib/loadEnvFiles';
import prisma from '../lib/prisma';

// Load production environment variables
loadEnvFiles();
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

async function checkNeon() {
  console.log('🔗 Connessione a Neon...');
  console.log(`Database URL: "${process.env.DATABASE_URL?.split('@')?.[1] || 'non impostato'}"`);
  
  console.log('\n--- ULTIME CAMPAGNE LINKEDIN ---');
  const linkedin = await prisma.marketingCampaign.findMany({
    where: { targetChannel: 'LINKEDIN' },
    orderBy: { updatedAt: 'desc' },
    take: 5,
  });
  for (const c of linkedin) {
    console.log(`ID: ${c.id} | Stato: ${c.status} | ExtID: ${c.externalId} | Errore: ${c.rejectionReason} | Aggiornato: ${c.updatedAt.toISOString()}`);
  }

  console.log('\n--- ULTIME CAMPAGNE TIKTOK ---');
  const tiktok = await prisma.marketingCampaign.findMany({
    where: { targetChannel: 'TIKTOK' },
    orderBy: { updatedAt: 'desc' },
    take: 5,
  });
  for (const c of tiktok) {
    console.log(`ID: ${c.id} | Stato: ${c.status} | ExtID: ${c.externalId} | Errore: ${c.rejectionReason} | Aggiornato: ${c.updatedAt.toISOString()}`);
  }
}

checkNeon().catch(console.error);
