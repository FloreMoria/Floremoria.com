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

        // Audit messaggi Meta WhatsApp
        const outboundMessages = await prisma.whatsAppChatMessage.findMany({
            where: { direction: 'OUTBOUND' },
            orderBy: { createdAt: 'desc' },
            take: 250,
            include: {
                session: {
                    select: {
                        phone: true,
                        name: true,
                        userType: true,
                    },
                },
            },
        });

        let sentCount = 0;
        let deliveredCount = 0;
        let readCount = 0;
        let failedCount = 0;

        const failedDetails: Array<{
            id: string;
            phone: string;
            recipientName: string;
            userType: string;
            bodyPreview: string;
            deliveryStatus: string;
            deliveryError?: string;
            createdAt: string;
        }> = [];

        for (const msg of outboundMessages) {
            const meta = (msg.metadata as Record<string, any>) || {};
            const status = (meta.deliveryStatus || 'SENT').toUpperCase();
            const hasError = Boolean(meta.deliveryError) || status === 'FAILED';

            if (hasError || status === 'FAILED') {
                failedCount++;
                failedDetails.push({
                    id: msg.id,
                    phone: msg.session?.phone || 'N/D',
                    recipientName: msg.session?.name || 'Utente/Fiorista',
                    userType: msg.session?.userType || 'UNKNOWN',
                    bodyPreview: msg.body.slice(0, 120),
                    deliveryStatus: 'FAILED',
                    deliveryError: meta.deliveryError || 'Mancata Consegna / Errore Meta API',
                    createdAt: new Date(msg.createdAt).toLocaleString('it-IT'),
                });
            } else if (status === 'READ') {
                readCount++;
            } else if (status === 'DELIVERED') {
                deliveredCount++;
            } else {
                sentCount++;
            }
        }

        const totalOutbound = outboundMessages.length;
        const deliveredRate = totalOutbound > 0 ? Math.round(((deliveredCount + readCount) / totalOutbound) * 100) : 100;
        const readRate = totalOutbound > 0 ? Math.round((readCount / totalOutbound) * 100) : 0;
        const failedRate = totalOutbound > 0 ? Math.round((failedCount / totalOutbound) * 100) : 0;

        return NextResponse.json({
            success: true,
            veraAutonomyRate: autonomyRate,
            humanEscalationRate: humanEscalationRate,
            gdmOpens,
            whatsappAudit: {
                totalOutbound,
                sentCount,
                deliveredCount,
                readCount,
                failedCount,
                deliveredRate,
                readRate,
                failedRate,
                failedDetails,
            },
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
                whatsappAudit: {
                    totalOutbound: 0,
                    sentCount: 0,
                    deliveredCount: 0,
                    readCount: 0,
                    failedCount: 0,
                    deliveredRate: 100,
                    readRate: 0,
                    failedRate: 0,
                    failedDetails: [],
                },
            },
            { status: 500 }
        );
    }
}
