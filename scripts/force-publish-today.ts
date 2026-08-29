/**
 * Recupero pubblicazione marketing del giorno: sync media multicanale + dispatch POSTMAN.
 *
 * Uso:
 *   npm run social:force-publish-today
 *   npm run social:force-publish-today -- --date=2026-08-29
 *   npm run social:force-publish-today -- --sync-only
 */
import { loadEnvFiles } from '../lib/loadEnvFiles';

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

function parseDateArg(): Date | undefined {
  const hit = process.argv.find((a) => a.startsWith('--date='));
  if (!hit) return undefined;
  const raw = hit.slice('--date='.length).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    console.error('Formato --date=YYYY-MM-DD non valido');
    process.exit(1);
  }
  return new Date(`${raw}T00:00:00.000Z`);
}

async function main(): Promise<void> {
  const syncOnly = process.argv.includes('--sync-only');
  const referenceDate = parseDateArg();

  const { getRomeCalendarDate, formatLabelForSlot, getDailyPublishSlots } = await import(
    '../lib/marketing/engine/contentCalendar'
  );
  const editorialDay = referenceDate ?? getRomeCalendarDate();
  const dayLabel = editorialDay.toISOString().slice(0, 10);

  console.log('══════════════════════════════════════════════════');
  console.log(`📅 Recupero pubblicazione marketing — ${dayLabel}`);
  console.log('══════════════════════════════════════════════════');

  const { syncMultichannelCampaignMedia } = await import('../lib/marketing/syncCampaignMedia');
  const sync = await syncMultichannelCampaignMedia(editorialDay);

  console.log('\n── Sync media multicanale ──');
  console.log(`  Media copiati: ${sync.mediaCopied}`);
  console.log(`  Video copiati: ${sync.videoCopied}`);
  console.log(`  Bozze promosse APPROVED: ${sync.draftsPromoted}`);
  console.log(`  Clone creati: ${sync.clonesCreated}`);
  for (const line of sync.details) {
    console.log(`  · ${line}`);
  }

  if (syncOnly) {
    console.log('\n(sync-only — publish saltato)');
    return;
  }

  const { runMarketingPublishPipeline } = await import('../lib/marketing/engine/publish');
  console.log('\n── Dispatch POSTMAN ──');
  const summary = await runMarketingPublishPipeline(50, editorialDay);

  console.log('\n── Esito per campagna ──');
  for (const result of summary.results) {
    const status = result.success
      ? result.simulated
        ? 'SIMULATED'
        : 'PUBLISHED'
      : 'FAILED';
    console.log(
      [
        `[${status}]`,
        result.channel,
        result.campaignId,
        result.externalId ? `ext=${result.externalId}` : '',
        result.permalink ? `url=${result.permalink}` : '',
        result.error ? `err=${result.error}` : '',
      ]
        .filter(Boolean)
        .join(' ')
    );
  }

  const slots = getDailyPublishSlots(editorialDay);
  console.log('\n── Riepilogo slot editoriali ──');
  for (const slot of slots) {
    const label = formatLabelForSlot(slot);
    const hits = summary.results.filter(
      (r) => r.channel === slot.channel && r.contentFormat === slot.contentFormat
    );
    if (hits.length === 0) {
      console.log(`  ✖ ${label} — nessun dispatch`);
      continue;
    }
    for (const hit of hits) {
      console.log(
        `  ${hit.success ? '✔' : '✖'} ${label} — ${hit.simulated ? 'simulato' : hit.externalId || 'ok'}${
          hit.permalink ? ` · ${hit.permalink}` : ''
        }${hit.error ? ` · ${hit.error}` : ''}`
      );
    }
  }

  console.log('\n══════════════════════════════════════════════════');
  console.log(
    `Totale: candidati=${summary.candidates}, pubblicati=${summary.published}, simulati=${summary.simulated}, errori=${summary.failed}`
  );
  console.log('══════════════════════════════════════════════════');

  if (summary.failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    const { default: prisma } = await import('../lib/prisma');
    await prisma.$disconnect();
  });
