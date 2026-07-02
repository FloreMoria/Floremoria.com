import { CampaignStatus } from '@prisma/client';
import prisma from '@/lib/prisma';
import { runDeliveryProofSocialPublishPipeline } from '@/lib/futuria/deliveryProofSocialPublish';
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
}

/**
 * Pubblica campagne marketing APPROVED + foto consegna social-ready via POSTMAN.
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
  };
}

async function runMarketingCampaignPublishPipeline(limit: number): Promise<{
  candidates: number;
  published: number;
  simulated: number;
  failed: number;
  results: CampaignPublishResult[];
}> {
  console.log('[Futuria Publish] ═══ Avvio pubblicazione campagne marketing APPROVED ═══');

  const campaigns = await prisma.marketingCampaign.findMany({
    where: {
      status: CampaignStatus.APPROVED,
      imageUrl: { not: '' },
    },
    orderBy: { updatedAt: 'asc' },
    take: limit,
  });

  const publishReady = campaigns.filter((c) => c.imageUrl?.trim());
  console.log(
    `[Futuria Publish] ${publishReady.length} campagne pronte su ${campaigns.length} APPROVED`
  );

  const results: CampaignPublishResult[] = [];

  for (const campaign of publishReady) {
    console.log(
      `[Futuria Publish] POSTMAN → ${campaign.targetChannel} · campagna ${campaign.id}`
    );

    const result = await publishCampaignToChannel({
      id: campaign.id,
      targetChannel: campaign.targetChannel,
      copy: campaign.copy,
      hashtags: campaign.hashtags,
      imageUrl: campaign.imageUrl,
    });

    results.push(result);

    if (result.success) {
      await prisma.marketingCampaign.update({
        where: { id: campaign.id },
        data: { status: CampaignStatus.PUBLISHED },
      });
      console.log(
        `[Futuria Publish] ✔ Campagna ${campaign.id} → PUBLISHED${
          result.simulated ? ' (simulata)' : ''
        }`
      );
    } else {
      console.warn(`[Futuria Publish] ✖ Campagna ${campaign.id} non pubblicata: ${result.error}`);
    }
  }

  const published = results.filter((r) => r.success && !r.simulated).length;
  const simulated = results.filter((r) => r.simulated).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(
    `[Futuria Publish] ═══ Campagne marketing — reali: ${published}, simulate: ${simulated}, errori: ${failed} ═══`
  );

  return {
    candidates: publishReady.length,
    published,
    simulated,
    failed,
    results,
  };
}
