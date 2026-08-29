import { CampaignStatus } from '@prisma/client';
import prisma from '@/lib/prisma';
import { runDeliveryProofSocialPublishPipeline } from '@/lib/marketing/deliveryProofSocialPublish';
import {
  getDailyPublishSlots,
  getRomeCalendarDate,
  formatLabelForSlot,
} from '@/lib/marketing/engine/contentCalendar';
import { findApprovedCampaignForPublishSlot } from '@/lib/marketing/engine/findPublishCandidate';
import { syncMultichannelCampaignMedia } from '@/lib/marketing/syncCampaignMedia';
import {
  publishCampaignToChannel,
  type CampaignPublishResult,
} from '@/lib/postman/socialPublish';
import type { DeliveryProofPublishSummary } from '@/lib/marketing/deliveryProofSocialPublish';

export interface MarketingPublishSummary {
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
 * Pubblica campagne marketing APPROVED via POSTMAN.
 * Foto consegna social-ready → Reel AI (Veo) ON di default (disattiva con =0).
 * Calendario: 1 contenuto per slot editoriale del giorno (IG/FB/TikTok post, story, reel).
 */
export async function runMarketingPublishPipeline(
  limit = 50,
  referenceDate = getRomeCalendarDate()
): Promise<MarketingPublishSummary> {
  const startedAt = new Date();

  const sync = await syncMultichannelCampaignMedia(referenceDate);
  console.log(
    `[Marketing Publish] Sync media multicanale — copied: ${sync.mediaCopied}, promoted: ${sync.draftsPromoted}, clones: ${sync.clonesCreated}`
  );

  const campaignSummary = await runMarketingCampaignPublishPipeline(limit, referenceDate);
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

async function runMarketingCampaignPublishPipeline(
  limit: number,
  referenceDate = getRomeCalendarDate()
): Promise<{
  candidates: number;
  published: number;
  simulated: number;
  failed: number;
  results: CampaignPublishResult[];
  slotsTargeted: number;
}> {
  const slots = getDailyPublishSlots(referenceDate);
  const today = referenceDate;

  console.log(
    `[Marketing Publish] ═══ Avvio pubblicazione calendario (${slots.length} slot) — ${today.toISOString().slice(0, 10)} ═══`
  );

  const results: CampaignPublishResult[] = [];
  let candidates = 0;

  for (const slot of slots) {
    const campaign = await findApprovedCampaignForPublishSlot(slot, today);

    if (!campaign) {
      console.log(`[Marketing Publish] Nessuna campagna APPROVED per ${formatLabelForSlot(slot)}`);
      continue;
    }

    candidates += 1;
    console.log(
      `[Marketing Publish] POSTMAN → ${formatLabelForSlot(slot)} · campagna ${campaign.id}`
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
      const existingMetrics =
        campaign.metricsJson && typeof campaign.metricsJson === 'object'
          ? (campaign.metricsJson as Record<string, unknown>)
          : {};
      await prisma.marketingCampaign.update({
        where: { id: campaign.id },
        data: {
          status: CampaignStatus.PUBLISHED,
          publishedAt: new Date(),
          videoUrl: result.videoUrl ?? campaign.videoUrl,
          ...(result.contentFormat ? { contentFormat: result.contentFormat } : {}),
          ...(result.externalId && !result.simulated
            ? { externalId: String(result.externalId) }
            : {}),
          ...(result.permalink && !result.simulated
            ? {
                metricsJson: {
                  ...existingMetrics,
                  permalink: result.permalink,
                },
                metricsSyncedAt: new Date(),
              }
            : {}),
        },
      });
      console.log(
        `[Marketing Publish] ✔ ${formatLabelForSlot(slot)} → PUBLISHED${
          result.simulated ? ' (simulata)' : ''
        }${result.externalId ? ` · ext=${result.externalId}` : ''}${
          result.permalink ? ` · ${result.permalink}` : ''
        }`
      );
    } else {
      console.warn(
        `[Marketing Publish] ✖ ${formatLabelForSlot(slot)} non pubblicata: ${result.error}`
      );
    }

    if (results.length >= limit) break;
  }

  const published = results.filter((r) => r.success && !r.simulated).length;
  const simulated = results.filter((r) => r.simulated).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(
    `[Marketing Publish] ═══ Campagne marketing — slot: ${slots.length}, pubblicate: ${published}, simulate: ${simulated}, errori: ${failed} ═══`
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
