import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getActiveTheme } from '@/lib/marketing/engine/contentCalendar';

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
