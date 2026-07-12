import { ContentFormat, MarketingChannel } from '@prisma/client';
import prisma from '@/lib/prisma';

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

/** Giorno dell'anno in Europe/Rome. */
export function getRomeDayIndex(reference = new Date()): number {
  const d = getRomeCalendarDate(reference);
  const start = new Date('2026-01-01T00:00:00.000Z');
  return Math.floor((d.getTime() - start.getTime()) / 86_400_000);
}

export function isPostDay(reference = new Date()): boolean {
  return getRomeDayIndex(reference) % 2 === 0;
}

export function isReelDay(reference = new Date()): boolean {
  return getRomeDayIndex(reference) % 4 === 0;
}

/**
 * Slot editoriali giornalieri FloreMoria aggiornati:
 * - Ogni giorno: story IG, story FB
 * - Ogni 2 giorni: post IG, post FB, post LinkedIn, post TikTok
 * - Ogni 4 giorni: reel IG, reel FB, reel TikTok
 */
export function getDailyPublishSlots(reference = new Date()): PublishSlot[] {
  const slots: PublishSlot[] = [
    { channel: MarketingChannel.META_INSTAGRAM, contentFormat: ContentFormat.STORY },
    { channel: MarketingChannel.META_FACEBOOK, contentFormat: ContentFormat.STORY },
  ];

  if (isPostDay(reference)) {
    slots.push(
      { channel: MarketingChannel.META_INSTAGRAM, contentFormat: ContentFormat.FEED_POST },
      { channel: MarketingChannel.META_FACEBOOK, contentFormat: ContentFormat.FEED_POST },
      { channel: MarketingChannel.LINKEDIN, contentFormat: ContentFormat.FEED_POST },
      { channel: MarketingChannel.TIKTOK, contentFormat: ContentFormat.FEED_POST }
    );
  }

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
          : slot.channel === MarketingChannel.LINKEDIN
            ? 'LinkedIn'
            : slot.channel;
  const format =
    slot.contentFormat === ContentFormat.REEL
      ? 'Reel'
      : slot.contentFormat === ContentFormat.STORY
        ? 'Story'
        : 'Post';
  return `${channel} ${format}`;
}

/**
 * Risolve il tema attivo per la data indicata:
 * 1. Cerca prima un override manuale memorizzato nel DB (chiave: 'marketing_active_theme').
 * 2. In assenza di override, calcola un tema stagionale ricorrente.
 * 3. Fallback sul tema identitario di default di FloreMoria.
 */
export async function getActiveTheme(referenceDate = new Date()): Promise<string> {
  try {
    const override = await prisma.systemState.findUnique({
      where: { key: 'marketing_active_theme' },
    });
    if (override?.value?.trim()) {
      return override.value.trim();
    }
  } catch (err) {
    console.warn('[Marketing Calendar] Errore lettura marketing_active_theme da DB:', err);
  }

  const month = referenceDate.getMonth(); // 0-11
  const day = referenceDate.getDate();

  // 25 Ottobre - 3 Novembre: Commemorazione dei Defunti (Giorno dei Morti)
  if ((month === 9 && day >= 25) || (month === 10 && day <= 3)) {
    return 'Commemorazione dei Defunti (Giorno dei Morti) - Ricordo solenne, rispetto profondo, vicinanza emotiva, commemorazione dei propri cari.';
  }

  // 10 Dicembre - 27 Dicembre: Natale e Ricordo Familiare
  if (month === 11 && day >= 10 && day <= 27) {
    return 'Natale e Ricordo Familiare - Calore degli affetti passati, legame invisibile che supera la distanza, dolce nostalgia e presenza.';
  }

  // 1 Maggio - 15 Maggio: Festa della Mamma
  if (month === 4 && day >= 1 && day <= 15) {
    return 'Festa della Mamma - Ricordo materno, dolcezza infinita, gratitudine eterna, il legame indissolubile con la madre.';
  }

  // 15 Marzo - 22 Marzo: Festa del Papà
  if (month === 2 && day >= 15 && day <= 22) {
    return 'Festa del Papà - Guida silenziosa, forza del ricordo, rispetto e gratitudine per la figura paterna.';
  }

  return 'Identitario FloreMoria - Stile Quiet Luxury, sobria eleganza, vicinanza e presenza concreta da lontano per onorare la memoria.';
}
