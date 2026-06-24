import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function formatDeviceLabel(userAgent: string | null | undefined): string {
    if (!userAgent?.trim()) return 'Browser';
    const ua = userAgent.trim();
    if (ua.includes('iPhone')) return 'iPhone';
    if (ua.includes('Android')) return 'Android';
    if (ua.includes('Macintosh')) return 'Mac';
    if (ua.includes('Windows')) return 'Windows';
    return ua.split(/[\s/]/)[0] || 'Browser';
}

export async function GET() {
    try {
        const totalSessions = await prisma.whatsAppChatSession.count();
        const humanSessions = await prisma.whatsAppChatSession.count({
            where: { status: 'HUMAN_INTERVENTION' },
        });

        const activeAiSessions = totalSessions - humanSessions;
        const autonomyRate =
            totalSessions > 0 ? Math.round((activeAiSessions / totalSessions) * 100) : 0;
        const humanEscalationRate =
            totalSessions > 0 ? Math.round((humanSessions / totalSessions) * 100) : 0;

        const recentOpens = await prisma.memoryGardenOpen.findMany({
            take: 10,
            orderBy: { openedAt: 'desc' },
            include: {
                order: {
                    select: {
                        orderNumber: true,
                        deceasedName: true,
                    },
                },
            },
        });

        const gdmOpens = recentOpens.map((open) => ({
            id: open.id,
            buyerName: open.buyerName || 'Utente Anonimo',
            buyerEmail: open.buyerEmail || 'N/D',
            orderNumber: open.order?.orderNumber || 'N/D',
            deceasedName: open.order?.deceasedName || 'N/D',
            openedAt: new Date(open.openedAt).toLocaleString('it-IT'),
            device: formatDeviceLabel(open.userAgent),
        }));

        return NextResponse.json({
            success: true,
            veraAutonomyRate: autonomyRate,
            humanEscalationRate: humanEscalationRate,
            gdmOpens,
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[Communications Analytics API Error]', message);
        return NextResponse.json(
            {
                success: false,
                error: message,
                veraAutonomyRate: 0,
                humanEscalationRate: 0,
                gdmOpens: [],
            },
            { status: 500 }
        );
    }
}
