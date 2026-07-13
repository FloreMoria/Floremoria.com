import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { publishCampaignToChannel } from '@/lib/postman/socialPublish';
import { CampaignStatus } from '@prisma/client';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { campaignId, tiktokUx } = body;
    if (!campaignId) {
      return NextResponse.json({ success: false, error: 'campaignId is required' }, { status: 400 });
    }

    const campaign = await prisma.marketingCampaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
    }

    console.log(`[Dashboard Publish] Manual force publish requested for campaign ${campaignId} to ${campaign.targetChannel}`);

    // Richiama il modulo postman per pubblicare
    const result = await publishCampaignToChannel({
      id: campaign.id,
      targetChannel: campaign.targetChannel,
      contentFormat: campaign.contentFormat,
      copy: campaign.copy,
      hashtags: campaign.hashtags,
      imageUrl: campaign.imageUrl || '',
      videoUrl: campaign.videoUrl,
      tiktokUx,
    });

    if (result.success) {
      // Aggiorna lo stato nel DB
      await prisma.marketingCampaign.update({
        where: { id: campaignId },
        data: {
          status: CampaignStatus.PUBLISHED,
        },
      });

      return NextResponse.json({
        success: true,
        simulated: result.simulated,
        externalId: result.externalId,
        privatePost: result.privatePost,
      });
    } else {
      return NextResponse.json({
        success: false,
        error: result.error || 'Failed to publish to channel',
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
