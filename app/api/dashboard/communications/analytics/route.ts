import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // 1. Calculate chat session status metrics
        const totalSessions = await prisma.whatsAppChatSession.count();
        const humanSessions = await prisma.whatsAppChatSession.count({
            where: { status: 'HUMAN_INTERVENTION' }
        });

        const activeAiSessions = totalSessions - humanSessions;
        const autonomyRate = totalSessions > 0 ? Math.round((activeAiSessions / totalSessions) * 100) : 85;
        const humanEscalationRate = totalSessions > 0 ? Math.round((humanSessions / totalSessions) * 100) : 15;

        // 2. Retrieve recent Memory Garden openings (with Order details)
        const recentOpens = await prisma.memoryGardenOpen.findMany({
            take: 10,
            orderBy: { openedAt: 'desc' },
            include: {
                order: {
                    select: {
                        orderNumber: true,
                        deceasedName: true
                    }
                }
            }
        });

        const formattedOpens = recentOpens.map(open => ({
            id: open.id,
            buyerName: open.buyerName || 'Utente Anonimo',
            buyerEmail: open.buyerEmail || 'N/D',
            orderNumber: open.order?.orderNumber || 'N/D',
            deceasedName: open.order?.deceasedName || 'N/D',
            openedAt: new Date(open.openedAt).toLocaleString('it-IT'),
            device: open.userAgent ? open.userAgent.split(' ')[0] : 'Browser'
        }));

        // Default mock opens if database has none (for demo tracking Riccardo Segantini)
        const finalOpens = formattedOpens.length > 0 ? formattedOpens : [
            {
                id: 'mock-1',
                buyerName: 'Riccardo Segantini',
                buyerEmail: 'riccardo.segantini@example.com',
                orderNumber: 'FT-2026-004',
                deceasedName: 'Giovanni Segantini',
                openedAt: '24/06/2026, 14:15:22',
                device: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X)'
            },
            {
                id: 'mock-2',
                buyerName: 'Anna Rossi',
                buyerEmail: 'anna.rossi@example.com',
                orderNumber: 'FT-2026-008',
                deceasedName: 'Maria Rossi',
                openedAt: '24/06/2026, 11:02:45',
                device: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4)'
            }
        ];

        return NextResponse.json({
            success: true,
            veraAutonomyRate: autonomyRate,
            humanEscalationRate: humanEscalationRate,
            gdmOpens: finalOpens
        });
    } catch (err: any) {
        console.error('[Communications Analytics API Error]', err);
        return NextResponse.json({
            success: false,
            error: err.message,
            veraAutonomyRate: 85.0,
            humanEscalationRate: 15.0,
            gdmOpens: [
                {
                    id: 'mock-1',
                    buyerName: 'Riccardo Segantini',
                    buyerEmail: 'riccardo.segantini@example.com',
                    orderNumber: 'FT-2026-004',
                    deceasedName: 'Giovanni Segantini',
                    openedAt: '24/06/2026, 14:15:22',
                    device: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X)'
                }
            ]
        });
    }
}
