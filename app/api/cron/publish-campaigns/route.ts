/**
 * GET /api/cron/publish-campaigns
 *
 * Trigger Vercel Cron — pubblicazione campagne Futuria in stato APPROVED.
 * Fase 1: conteggio record pronti (integrazione POSTMAN/canali in step successivo).
 */
import { CampaignStatus } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization');

    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    try {
        const approvedCampaigns = await prisma.marketingCampaign.findMany({
            where: { status: CampaignStatus.APPROVED },
            select: { id: true, targetChannel: true, category: true },
            orderBy: { createdAt: 'asc' },
            take: 50,
        });

        const processed = 0;

        return NextResponse.json(
            {
                success: true,
                message: 'Cron trigger eseguito con successo',
                processed,
                approvedCampaignsFound: approvedCampaigns.length,
                pendingIds: approvedCampaigns.map((c) => c.id),
            },
            { status: 200 }
        );
    } catch (error) {
        console.error('❌ Errore nel cron job publish-campaigns:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
