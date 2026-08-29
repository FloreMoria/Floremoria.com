import { CampaignStatus, ContentFormat, MarketingChannel, Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { getDailyPublishSlots, getRomeCalendarDate, slotKey } from '@/lib/marketing/engine/contentCalendar';

const SOURCE_CHANNEL_PRIORITY: MarketingChannel[] = [
  MarketingChannel.META_INSTAGRAM,
  MarketingChannel.META_FACEBOOK,
  MarketingChannel.LINKEDIN,
  MarketingChannel.TIKTOK,
  MarketingChannel.PINTEREST,
  MarketingChannel.YOUTUBE_SHORTS,
];

export type SyncCampaignMediaResult = {
  referenceDate: string;
  batchesScanned: number;
  mediaCopied: number;
  videoCopied: number;
  draftsPromoted: number;
  clonesCreated: number;
  details: string[];
};

function hasMediaUrl(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function pickMediaSource(
  campaigns: Array<{
    id: string;
    targetChannel: MarketingChannel;
    contentFormat: ContentFormat;
    imageUrl: string;
    videoUrl: string | null;
    status: CampaignStatus;
  }>,
  contentFormat: ContentFormat
) {
  const withImage = campaigns.filter(
    (c) => c.contentFormat === contentFormat && hasMediaUrl(c.imageUrl)
  );
  if (withImage.length === 0) return null;

  for (const channel of SOURCE_CHANNEL_PRIORITY) {
    const hit = withImage.find((c) => c.targetChannel === channel);
    if (hit) return hit;
  }

  return withImage[0] ?? null;
}

/**
 * Propaga imageUrl/videoUrl dal canale sorgente (IG/FB) alle campagne gemelle
 * dello stesso giorno editoriale che hanno copy ma media mancante.
 */
export async function syncMultichannelCampaignMedia(
  referenceDate = getRomeCalendarDate()
): Promise<SyncCampaignMediaResult> {
  const details: string[] = [];
  let mediaCopied = 0;
  let videoCopied = 0;
  let draftsPromoted = 0;
  let clonesCreated = 0;

  const dayCampaigns = await prisma.marketingCampaign.findMany({
    where: {
      scheduledFor: referenceDate,
      status: { in: [CampaignStatus.DRAFT, CampaignStatus.APPROVED, CampaignStatus.PUBLISHED] },
    },
    orderBy: { createdAt: 'asc' },
  });

  const formats = [...new Set(dayCampaigns.map((c) => c.contentFormat))];
  const batchesScanned = formats.length;

  for (const contentFormat of formats) {
    const batch = dayCampaigns.filter((c) => c.contentFormat === contentFormat);
    const source = pickMediaSource(batch, contentFormat);
    if (!source) continue;

    for (const target of batch) {
      if (target.id === source.id) continue;

      const data: Prisma.MarketingCampaignUpdateInput = {};
      if (!hasMediaUrl(target.imageUrl) && hasMediaUrl(source.imageUrl)) {
        data.imageUrl = source.imageUrl;
        mediaCopied += 1;
        details.push(
          `media ${target.targetChannel}/${contentFormat} ← ${source.targetChannel} (${target.id})`
        );
      }
      if (
        !hasMediaUrl(target.videoUrl) &&
        hasMediaUrl(source.videoUrl) &&
        (contentFormat === ContentFormat.REEL || hasMediaUrl(source.videoUrl))
      ) {
        data.videoUrl = source.videoUrl;
        videoCopied += 1;
        details.push(
          `video ${target.targetChannel}/${contentFormat} ← ${source.targetChannel} (${target.id})`
        );
      }

      if (Object.keys(data).length === 0) continue;

      await prisma.marketingCampaign.update({
        where: { id: target.id },
        data,
      });
    }
  }

  // Promuove bozze del giorno con media ereditato se un gemello è già APPROVED (stesso formato).
  const refreshedDayCampaigns = await prisma.marketingCampaign.findMany({
    where: {
      scheduledFor: referenceDate,
      status: { in: [CampaignStatus.DRAFT, CampaignStatus.APPROVED] },
    },
  });

  for (const draft of refreshedDayCampaigns.filter((c) => c.status === CampaignStatus.DRAFT)) {
    if (!hasMediaUrl(draft.imageUrl)) continue;

    const siblingApproved = refreshedDayCampaigns.some(
      (c) =>
        c.id !== draft.id &&
        c.status === CampaignStatus.APPROVED &&
        c.contentFormat === draft.contentFormat &&
        hasMediaUrl(c.imageUrl)
    );
    if (!siblingApproved) continue;

    await prisma.marketingCampaign.update({
      where: { id: draft.id },
      data: { status: CampaignStatus.APPROVED },
    });
    draftsPromoted += 1;
    details.push(`promoted APPROVED ${draft.targetChannel}/${draft.contentFormat} (${draft.id})`);
  }

  // Crea record mancanti per slot editoriali del giorno clonando copy/media da IG.
  const slots = getDailyPublishSlots(referenceDate);
  const existingKeys = new Set(
    dayCampaigns.map((c) => slotKey({ channel: c.targetChannel, contentFormat: c.contentFormat }))
  );

  for (const slot of slots) {
    const key = slotKey(slot);
    if (existingKeys.has(key)) continue;

    const source = pickMediaSource(dayCampaigns, slot.contentFormat);
    if (!source) continue;

    const template =
      dayCampaigns.find(
        (c) =>
          c.targetChannel === MarketingChannel.META_INSTAGRAM &&
          c.contentFormat === slot.contentFormat &&
          c.copy.trim()
      ) ??
      dayCampaigns.find((c) => c.contentFormat === slot.contentFormat && c.copy.trim());

    if (!template) continue;

    const row = await prisma.marketingCampaign.create({
      data: {
        status: CampaignStatus.APPROVED,
        category: template.category,
        targetChannel: slot.channel,
        contentFormat: slot.contentFormat,
        scheduledFor: referenceDate,
        copy: template.copy,
        hashtags: template.hashtags,
        imageUrl: source.imageUrl,
        videoUrl: source.videoUrl,
        imagePrompt: template.imagePrompt,
      },
    });
    clonesCreated += 1;
    existingKeys.add(key);
    details.push(`clone ${slot.channel}/${slot.contentFormat} (${row.id})`);
  }

  return {
    referenceDate: referenceDate.toISOString().slice(0, 10),
    batchesScanned,
    mediaCopied,
    videoCopied,
    draftsPromoted,
    clonesCreated,
    details,
  };
}
