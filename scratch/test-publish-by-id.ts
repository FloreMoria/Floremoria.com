import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFiles } from '../lib/loadEnvFiles';
import { publishCampaignToChannel } from '../lib/postman/socialPublish';
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

async function testPublish() {
  console.log('🚀 AVVIO TEST DI PUBBLICAZIONE REALE...');
  console.log(`Database target: "${process.env.DATABASE_URL?.split('@')?.[1] || 'sconosciuto'}"`);
  
  const linkedinId = 'cmri5jomk00046dvvgai51dxu';
  const tiktokId = 'cmri5jooi00056dvvc7vfddlb';

  console.log(`\n--- 1. TENTATIVO PUBBLICAZIONE LINKEDIN (${linkedinId}) ---`);
  const campaignLi = await prisma.marketingCampaign.findUnique({ where: { id: linkedinId } });
  if (!campaignLi) {
    console.error('Campagna LinkedIn non trovata!');
  } else {
    try {
      const res = await publishCampaignToChannel(campaignLi);
      console.log('Esito LinkedIn:', res);
    } catch (err) {
      console.error('Errore LinkedIn:', err);
    }
  }

  console.log(`\n--- 2. TENTATIVO PUBBLICAZIONE TIKTOK (${tiktokId}) ---`);
  const campaignTt = await prisma.marketingCampaign.findUnique({ where: { id: tiktokId } });
  if (!campaignTt) {
    console.error('Campagna TikTok non trovata!');
  } else {
    try {
      const res = await publishCampaignToChannel(campaignTt);
      console.log('Esito TikTok:', res);
    } catch (err) {
      console.error('Errore TikTok:', err);
    }
  }
}

testPublish().catch(console.error);
