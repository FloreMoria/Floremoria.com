import { DeliveryProofStatus, MarketingChannel } from '@prisma/client';
import prisma from '@/lib/prisma';
import {
  publishCampaignToChannel,
  type CampaignPublishResult,
} from '@/lib/postman/socialPublish';

export const DELIVERY_PROOF_PUBLISH_CHANNELS: MarketingChannel[] = [
  MarketingChannel.META_INSTAGRAM,
  MarketingChannel.META_FACEBOOK,
];

export interface DeliveryProofPublishSummary {
  startedAt: string;
  finishedAt: string;
  proofsCandidates: number;
  postsAttempted: number;
  published: number;
  simulated: number;
  failed: number;
  results: CampaignPublishResult[];
}

function proofNeedsChannel(
  publishedChannels: string[],
  channel: MarketingChannel
): boolean {
  return !publishedChannels.includes(channel);
}

/**
 * Pubblica foto consegna sanificate (socialReadyPrimaryUrl + socialCopyCategory)
 * su Meta via POSTMAN.
 */
export async function runDeliveryProofSocialPublishPipeline(
  limit = 30
): Promise<DeliveryProofPublishSummary> {
  const startedAt = new Date();
  console.log('[Marketing Publish] ═══ Avvio pubblicazione foto consegna (social-ready) ═══');

  const proofs = await prisma.deliveryProof.findMany({
    where: {
      status: DeliveryProofStatus.COMPLETED,
      socialReadyPrimaryUrl: { not: null },
    },
    orderBy: { socialSanitizedAt: 'asc' },
    take: limit,
    select: {
      id: true,
      orderId: true,
      socialReadyPrimaryUrl: true,
      socialCopyCategory: true,
      socialPublishedChannels: true,
    },
  });

  const eligible = proofs.filter((p) => {
    if (!p.socialReadyPrimaryUrl?.trim()) return false;
    return DELIVERY_PROOF_PUBLISH_CHANNELS.some((ch) =>
      proofNeedsChannel(p.socialPublishedChannels, ch)
    );
  });

  console.log(
    `[Marketing Publish] ${eligible.length} proof con asset social-ready da pubblicare (su ${proofs.length} candidati)`
  );

  const results: CampaignPublishResult[] = [];
  let postsAttempted = 0;

  for (const proof of eligible) {
    for (const channel of DELIVERY_PROOF_PUBLISH_CHANNELS) {
      if (!proofNeedsChannel(proof.socialPublishedChannels, channel)) {
        continue;
      }

      postsAttempted += 1;
      const publishId = `delivery-proof:${proof.id}:${channel}`;

      console.log(
        `[Marketing Publish] POSTMAN (consegna) → ${channel} · proof ${proof.id} · ordine ${proof.orderId}`
      );

      const result = await publishCampaignToChannel({
        id: publishId,
        targetChannel: channel,
        copy: '',
        hashtags: [],
        imageUrl: proof.socialReadyPrimaryUrl!,
        deliveryProofId: proof.id,
      });

      results.push(result);

      if (result.success) {
        const updated = await prisma.deliveryProof.update({
          where: { id: proof.id },
          data: {
            socialPublishedChannels: {
              push: channel,
            },
          },
          select: { socialPublishedChannels: true },
        });
        proof.socialPublishedChannels = updated.socialPublishedChannels;

        console.log(
          `[Marketing Publish] ✔ Proof ${proof.id} → ${channel} PUBLISHED${
            result.simulated ? ' (simulata)' : ''
          }`
        );
      } else {
        console.warn(
          `[Marketing Publish] ✖ Proof ${proof.id} · ${channel} non pubblicato: ${result.error}`
        );
      }
    }
  }

  const finishedAt = new Date();
  const summary: DeliveryProofPublishSummary = {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    proofsCandidates: eligible.length,
    postsAttempted,
    published: results.filter((r) => r.success && !r.simulated).length,
    simulated: results.filter((r) => r.simulated).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };

  console.log(
    `[Marketing Publish] ═══ Foto consegna — reali: ${summary.published}, simulate: ${summary.simulated}, errori: ${summary.failed} ═══`
  );

  return summary;
}
