import { CampaignStatus } from '@prisma/client';
import prisma from '@/lib/prisma';
import { runDeliveryProofSocialPublishPipeline } from '@/lib/futuria/deliveryProofSocialPublish';
import {
  getDailyPublishSlots,
  getRomeCalendarDate,
  formatLabelForSlot,
} from '@/lib/futuria/engine/contentCalendar';
import {
  publishCampaignToChannel,
  type CampaignPublishResult,
} from '@/lib/postman/socialPublish';
import type { DeliveryProofPublishSummary } from '@/lib/futuria/deliveryProofSocialPublish';

export interface FuturiaPublishSummary {
  startedAt: string;
  finishedAt: string;
  candidates: number;
  published: number;
  simulated: number;
  failed: number;
  results: CampaignPublishResult[];
  deliveryProof: DeliveryProofPublishSummary;
  slotsTargeted: number;
}

/**
 * Pubblica campagne marketing APPROVED + foto consegna social-ready via POSTMAN.
 * Calendario: 1 contenuto per slot editoriale del giorno (IG/FB/TikTok post, story, reel).
 */
export async function runFuturiaPublishPipeline(limit = 50): Promise<FuturiaPublishSummary> {
  const startedAt = new Date();

  const campaignSummary = await runMarketingCampaignPublishPipeline(limit);
  const deliveryProofSummary = await runDeliveryProofSocialPublishPipeline(limit);

  const finishedAt = new Date();

  return {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    candidates: campaignSummary.candidates + deliveryProofSummary.proofsCandidates,
    published: campaignSummary.published + deliveryProofSummary.published,
    simulated: campaignSummary.simulated + deliveryProofSummary.simulated,
    failed: campaignSummary.failed + deliveryProofSummary.failed,
    results: [...campaignSummary.results, ...deliveryProofSummary.results],
    deliveryProof: deliveryProofSummary,
    slotsTargeted: campaignSummary.slotsTargeted,
  };
}

async function runMarketingCampaignPublishPipeline(limit: number): Promise<{
  candidates: number;
  published: number;
  simulated: number;
  failed: number;
  results: CampaignPublishResult[];
  slotsTargeted: number;
}> {
  const slots = getDailyPublishSlots();
  const today = getRomeCalendarDate();

  console.log(
    `[Futuria Publish] ═══ Avvio pubblicazione calendario (${slots.length} slot) — ${today.toISOString().slice(0, 10)} ═══`
  );

  const results: CampaignPublishResult[] = [];
  let candidates = 0;

  for (const slot of slots) {
    const campaign = await prisma.marketingCampaign.findFirst({
      where: {
        status: CampaignStatus.APPROVED,
        targetChannel: slot.channel,
        contentFormat: slot.contentFormat,
        imageUrl: { not: '' },
        OR: [{ scheduledFor: today }, { scheduledFor: null }],
      },
      orderBy: { updatedAt: 'asc' },
    });

    if (!campaign) {
      console.log(`[Futuria Publish] Nessuna campagna APPROVED per ${formatLabelForSlot(slot)}`);
      continue;
    }

    candidates += 1;
    console.log(
      `[Futuria Publish] POSTMAN → ${formatLabelForSlot(slot)} · campagna ${campaign.id}`
    );

    const result = await publishCampaignToChannel({
      id: campaign.id,
      targetChannel: campaign.targetChannel,
      contentFormat: campaign.contentFormat,
      copy: campaign.copy,
      hashtags: campaign.hashtags,
      imageUrl: campaign.imageUrl,
      videoUrl: campaign.videoUrl,
    });

    results.push(result);

    if (result.success) {
      await prisma.marketingCampaign.update({
        where: { id: campaign.id },
        data: {
          status: CampaignStatus.PUBLISHED,
          videoUrl: result.videoUrl ?? campaign.videoUrl,
        },
      });
      console.log(
        `[Futuria Publish] ✔ ${formatLabelForSlot(slot)} → PUBLISHED${
          result.simulated ? ' (simulata)' : ''
        }`
      );
    } else {
      console.warn(
        `[Futuria Publish] ✖ ${formatLabelForSlot(slot)} non pubblicata: ${result.error}`
      );
    }

    if (results.length >= limit) break;
  }

  const published = results.filter((r) => r.success && !r.simulated).length;
  const simulated = results.filter((r) => r.simulated).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(
    `[Futuria Publish] ═══ Campagne marketing — slot: ${slots.length}, pubblicate: ${published}, simulate: ${simulated}, errori: ${failed} ═══`
  );

  return {
    candidates,
    published,
    simulated,
    failed,
    results,
    slotsTargeted: slots.length,
  };
}
