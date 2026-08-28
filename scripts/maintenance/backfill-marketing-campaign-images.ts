/**
 * Backfill immagini per bozze marketing senza imageUrl (post shutdown Imagen 4).
 *
 * Uso:
 *   npx tsx scripts/maintenance/backfill-marketing-campaign-images.ts
 *   npx tsx scripts/maintenance/backfill-marketing-campaign-images.ts --limit=5
 *   npx tsx scripts/maintenance/backfill-marketing-campaign-images.ts --since=2026-08-18
 */
import { loadEnvFiles } from '@/lib/loadEnvFiles';
import prisma from '@/lib/prisma';
import { generateAndStorageCampaignImage } from '@/lib/marketing/engine/images';
import { evaluateCampaignDraft } from '@/lib/marketing/engine/checkpoint';

loadEnvFiles();

function parseArg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
}

async function main() {
  const limit = Math.max(1, Number.parseInt(parseArg('limit', '12'), 10) || 12);
  const since = parseArg('since', '2026-08-18');
  const sinceDate = new Date(`${since}T00:00:00.000Z`);

  const drafts = await prisma.marketingCampaign.findMany({
    where: {
      status: { in: ['DRAFT', 'REJECTED'] },
      imageUrl: '',
      copy: { not: '' },
      createdAt: { gte: sinceDate },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      targetChannel: true,
      contentFormat: true,
      createdAt: true,
    },
  });

  console.log(`[backfill-images] ${drafts.length} campagne da processare (since ${since})`);

  let ok = 0;
  let failed = 0;

  for (const row of drafts) {
    const label = `${row.id} · ${row.targetChannel} · ${row.contentFormat}`;
    try {
      console.log(`\n→ ${label}`);
      const url = await generateAndStorageCampaignImage(row.id, { force: true });
      console.log(`  immagine: ${url}`);

      const checkpoint = await evaluateCampaignDraft(row.id);
      console.log(
        `  checkpoint: ${checkpoint.approved ? 'APPROVED' : 'REJECTED'}${
          checkpoint.reason ? ` — ${checkpoint.reason}` : ''
        }`
      );
      ok += 1;
    } catch (e) {
      failed += 1;
      console.error(`  ERRORE: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`\n[backfill-images] completato — ok: ${ok}, errori: ${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
