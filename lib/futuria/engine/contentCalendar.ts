import { ContentFormat, MarketingChannel } from '@prisma/client';

export type PublishSlot = {
  channel: MarketingChannel;
  contentFormat: ContentFormat;
};

const ROME_TIMEZONE = 'Europe/Rome';

/** Data calendario (mezzanotte) in fuso Europe/Rome. */
export function getRomeCalendarDate(reference = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ROME_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(reference);

  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';

  return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
}

/** Giorno dell'anno in Europe/Rome (per slot reel ogni 3 giorni). */
export function getRomeDayIndex(reference = new Date()): number {
  const d = getRomeCalendarDate(reference);
  const start = new Date('2026-01-01T00:00:00.000Z');
  return Math.floor((d.getTime() - start.getTime()) / 86_400_000);
}

export function isReelDay(reference = new Date()): boolean {
  return getRomeDayIndex(reference) % 3 === 0;
}

/**
 * Slot editoriali giornalieri FloreMoria:
 * - Ogni giorno: post IG, post FB, post TikTok, story IG, story FB
 * - Ogni 3 giorni: reel IG, reel FB, reel TikTok
 */
export function getDailyPublishSlots(reference = new Date()): PublishSlot[] {
  const slots: PublishSlot[] = [
    { channel: MarketingChannel.META_INSTAGRAM, contentFormat: ContentFormat.FEED_POST },
    { channel: MarketingChannel.META_FACEBOOK, contentFormat: ContentFormat.FEED_POST },
    { channel: MarketingChannel.TIKTOK, contentFormat: ContentFormat.FEED_POST },
    { channel: MarketingChannel.META_INSTAGRAM, contentFormat: ContentFormat.STORY },
    { channel: MarketingChannel.META_FACEBOOK, contentFormat: ContentFormat.STORY },
  ];

  if (isReelDay(reference)) {
    slots.push(
      { channel: MarketingChannel.META_INSTAGRAM, contentFormat: ContentFormat.REEL },
      { channel: MarketingChannel.META_FACEBOOK, contentFormat: ContentFormat.REEL },
      { channel: MarketingChannel.TIKTOK, contentFormat: ContentFormat.REEL }
    );
  }

  return slots;
}

export function slotKey(slot: PublishSlot): string {
  return `${slot.channel}:${slot.contentFormat}`;
}

export function formatLabelForSlot(slot: PublishSlot): string {
  const channel =
    slot.channel === MarketingChannel.META_INSTAGRAM
      ? 'Instagram'
      : slot.channel === MarketingChannel.META_FACEBOOK
        ? 'Facebook'
        : slot.channel === MarketingChannel.TIKTOK
          ? 'TikTok'
          : slot.channel;
  const format =
    slot.contentFormat === ContentFormat.REEL
      ? 'Reel'
      : slot.contentFormat === ContentFormat.STORY
        ? 'Story'
        : 'Post';
  return `${channel} ${format}`;
}
