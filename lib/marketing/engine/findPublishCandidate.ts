import { CampaignStatus, ContentFormat, MarketingChannel } from '@prisma/client';
import prisma from '@/lib/prisma';
import type { PublishSlot } from '@/lib/marketing/engine/contentCalendar';

/**
 * Seleziona la campagna APPROVED migliore per uno slot editoriale:
 * 1) scheduledFor = giorno target (priorità massima)
 * 2) fallback: scheduledFor null ma aggiornata/creata nello stesso giorno
 * Ordine: updatedAt desc (più recente per primo).
 */
export async function findApprovedCampaignForPublishSlot(
  slot: PublishSlot,
  editorialDay: Date
) {
  const baseWhere = {
    status: CampaignStatus.APPROVED,
    targetChannel: slot.channel,
    contentFormat: slot.contentFormat,
    imageUrl: { not: '' },
  } as const;

  const forDay = await prisma.marketingCampaign.findFirst({
    where: {
      ...baseWhere,
      scheduledFor: editorialDay,
    },
    orderBy: { updatedAt: 'desc' },
  });
  if (forDay) return forDay;

  const dayEnd = new Date(editorialDay);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  return prisma.marketingCampaign.findFirst({
    where: {
      ...baseWhere,
      scheduledFor: null,
      updatedAt: { gte: editorialDay, lt: dayEnd },
    },
    orderBy: { updatedAt: 'desc' },
  });
}

export type { MarketingChannel, ContentFormat };
