/**
 * Sincronizza imageUrl/videoUrl tra campagne gemelle dello stesso giorno editoriale.
 *
 * Uso:
 *   npm run social:sync-campaign-media
 *   npm run social:sync-campaign-media -- --date=2026-08-29
 */
import { loadEnvFiles } from '../../lib/loadEnvFiles';

loadEnvFiles();

function preferNonLocalDatabaseUrl(): void {
  const current = process.env.DATABASE_URL?.trim() ?? '';
  const host = current.match(/@([^/:?]+)/)?.[1] ?? '';
  if (host !== 'localhost' && host !== '127.0.0.1') return;
  for (const key of ['DATABASE_URL_UNPOOLED', 'DATABASE_POSTGRES_URL']) {
    const candidate = process.env[key]?.trim();
    if (!candidate || candidate.includes('localhost')) continue;
    process.env.DATABASE_URL = candidate;
    return;
  }
}

preferNonLocalDatabaseUrl();

async function main(): Promise<void> {
  const hit = process.argv.find((a) => a.startsWith('--date='));
  const referenceDate = hit
    ? new Date(`${hit.slice('--date='.length).trim()}T00:00:00.000Z`)
    : undefined;

  const { syncMultichannelCampaignMedia } = await import('../../lib/marketing/syncCampaignMedia');
  const result = await syncMultichannelCampaignMedia(referenceDate);

  console.log(JSON.stringify(result, null, 2));
  if (result.mediaCopied === 0 && result.draftsPromoted === 0 && result.clonesCreated === 0) {
    console.log('Nessuna modifica necessaria.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    const { default: prisma } = await import('../../lib/prisma');
    await prisma.$disconnect();
  });
