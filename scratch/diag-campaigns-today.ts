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

async function main() {
  const { default: prisma } = await import('../lib/prisma');
  const { getRomeCalendarDate, getDailyPublishSlots, formatLabelForSlot } = await import(
    '../lib/marketing/engine/contentCalendar'
  );

  const today = getRomeCalendarDate(new Date('2026-08-29T08:00:00+02:00'));
  console.log('Today Rome:', today.toISOString());
  const slots = getDailyPublishSlots(new Date('2026-08-29T08:00:00+02:00'));
  console.log('Slots today:', slots.length);

  const approved = await prisma.marketingCampaign.findMany({
    where: { status: 'APPROVED' },
    orderBy: { updatedAt: 'desc' },
    take: 40,
  });
  console.log('Approved count:', approved.length);
  for (const a of approved) {
    const img = a.imageUrl?.trim() ? 'IMG' : 'NO_IMG';
    const vid = a.videoUrl?.trim() ? 'VID' : 'NO_VID';
    const sched = a.scheduledFor ? a.scheduledFor.toISOString().slice(0, 10) : 'null';
    console.log(
      `- ${a.targetChannel}/${a.contentFormat} [${img}/${vid}] sched=${sched} upd=${a.updatedAt.toISOString().slice(0, 10)} id=${a.id}`
    );
  }

  const noImg = await prisma.marketingCampaign.findMany({
    where: { status: 'APPROVED', imageUrl: '' },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  });
  console.log('\nApproved without image:', noImg.length);
  for (const a of noImg) {
    console.log(`- ${a.targetChannel}/${a.contentFormat} sched=${a.scheduledFor?.toISOString().slice(0, 10) ?? 'null'} id=${a.id}`);
  }

  const todayBatch = await prisma.marketingCampaign.findMany({
    where: { scheduledFor: today, status: { in: ['APPROVED', 'DRAFT', 'PUBLISHED'] } },
    orderBy: { targetChannel: 'asc' },
  });
  console.log('\nToday batch count:', todayBatch.length);
  for (const a of todayBatch) {
    const img = a.imageUrl?.trim() ? 'IMG' : 'NO_IMG';
    console.log(`- ${a.status} ${a.targetChannel}/${a.contentFormat} [${img}] id=${a.id.slice(0, 12)}`);
  }

  for (const slot of slots) {
    const c = await prisma.marketingCampaign.findFirst({
      where: {
        status: 'APPROVED',
        targetChannel: slot.channel,
        contentFormat: slot.contentFormat,
        imageUrl: { not: '' },
        OR: [{ scheduledFor: today }, { scheduledFor: null }],
      },
      orderBy: { updatedAt: 'asc' },
    });
    console.log('Slot', formatLabelForSlot(slot), '=>', c ? c.id : 'NONE');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
