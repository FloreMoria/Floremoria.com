import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getActiveTheme } from '@/lib/marketing/engine/contentCalendar';
import { CampaignStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const campaigns = await prisma.marketingCampaign.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const activeTheme = await getActiveTheme();
    const manualThemeOverride = await prisma.systemState.findUnique({
      where: { key: 'marketing_active_theme' },
    });

    return NextResponse.json({
      success: true,
      campaigns,
      activeTheme,
      manualThemeOverride: manualThemeOverride?.value || '',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { theme } = await request.json();
    const key = 'marketing_active_theme';

    if (theme === undefined || theme === null) {
      return NextResponse.json({ success: false, error: 'Theme value is required' }, { status: 400 });
    }

    const trimmed = String(theme).trim();

    if (trimmed === '') {
      // Cancella l'override per tornare al tema automatico
      await prisma.systemState.deleteMany({
        where: { key },
      });
    } else {
      await prisma.systemState.upsert({
        where: { key },
        create: { key, value: trimmed },
        update: { value: trimmed },
      });
    }

    const newActiveTheme = await getActiveTheme();

    return NextResponse.json({
      success: true,
      activeTheme: newActiveTheme,
      manualThemeOverride: trimmed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { campaignId, copy, hashtags } = await request.json();

    if (!campaignId) {
      return NextResponse.json({ success: false, error: 'campaignId is required' }, { status: 400 });
    }

    const campaign = await prisma.marketingCampaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
    }

    const updated = await prisma.marketingCampaign.update({
      where: { id: campaignId },
      data: {
        copy: copy !== undefined ? String(copy).trim() : campaign.copy,
        hashtags: Array.isArray(hashtags)
          ? hashtags.map((t) => String(t).trim().replace(/^#+/, '').toLowerCase()).filter(Boolean)
          : campaign.hashtags,
        // Se modifichiamo una campagna rejected, portiamola a APPROVED (l'operatore l'ha appena corretta)
        status: campaign.status === CampaignStatus.REJECTED ? CampaignStatus.APPROVED : campaign.status,
      },
    });

    return NextResponse.json({
      success: true,
      campaign: updated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
