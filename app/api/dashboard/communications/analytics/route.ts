import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { purgeOldWebhookDeliveryErrors } from '@/lib/whatsapp/purgeDeliveryLogs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Finestra analytics WhatsApp & Retention Registro Mancata Consegna (giorni). */
const ANALYTICS_WINDOW_DAYS = 7;
/** Campione outbound per ripartizione status Meta (webhook). */
const STATUS_SAMPLE_SIZE = 500;

function formatDeviceLabel(userAgent: string | null | undefined): {
    device: string;
    isBot: boolean;
    hint?: string;
} {
    if (!userAgent?.trim()) return { device: 'Browser', isBot: false };
    const ua = userAgent.trim();
    const lower = ua.toLowerCase();

    // Crawler Meta: apre il link solo per generare l'anteprima OG su WhatsApp/Facebook.
    if (lower.includes('facebookexternalhit') || lower.includes('facebot')) {
        return {
            device: 'Anteprima Meta (bot)',
            isBot: true,
            hint: 'facebookexternalhit: crawler Meta/WhatsApp che scarica l’anteprima del link, non un’apertura umana.',
        };
    }
    if (lower.includes('whatsapp')) {
        return { device: 'WhatsApp preview', isBot: true, hint: 'User-Agent WhatsApp (spesso anteprima link).' };
    }
    if (ua.includes('iPhone')) return { device: 'iPhone', isBot: false };
    if (ua.includes('Android')) return { device: 'Android', isBot: false };
    if (ua.includes('Macintosh')) return { device: 'Mac', isBot: false };
    if (ua.includes('Windows')) return { device: 'Windows', isBot: false };
    if (ua.includes('iPad')) return { device: 'iPad', isBot: false };
    return { device: ua.split(/[\s/]/)[0] || 'Browser', isBot: false };
}

function isHumanOperatorOutbound(meta: Record<string, unknown>): boolean {
    const source = String(meta.source || '').toLowerCase();
    if (source === 'operator') return true;
    const mode = String(meta.outboundMode || '').toLowerCase();
    if (mode === 'photo' || mode === 'forward' || mode === 'freetext') {
        // freetext può essere anche VERA; solo con source operator è umano.
        return source === 'operator';
    }
    return false;
}

function isOutside24hTemplate(meta: Record<string, unknown>): boolean {
    const mode = String(meta.outboundMode || '').toLowerCase();
    if (
        mode === 'template_fallback_24h' ||
        mode === 'template_forced' ||
        mode === 'template'
    ) {
        return true;
    }
    const eventType = String(meta.eventType || '').toUpperCase();
    return eventType.includes('TEMPLATE') || eventType.endsWith('_TEMPLATE');
}

function pct(part: number, whole: number): number {
    if (whole <= 0) return 0;
    return Math.round((part / whole) * 100);
}

export async function GET() {
    try {
        // Auto-Purge dei log errori webhook piu vecchi di 7 giorni
        await purgeOldWebhookDeliveryErrors(ANALYTICS_WINDOW_DAYS);

        const since = new Date();
        since.setDate(since.getDate() - ANALYTICS_WINDOW_DAYS);

        const [
            totalSessions,
            humanSessions,
            outboundInWindow,
            inboundInWindow,
            photosOutbound,
            photosInbound,
            statusSample,
            recentOpens,
        ] = await Promise.all([
            prisma.whatsAppChatSession.count(),
            prisma.whatsAppChatSession.count({
                where: { status: 'HUMAN_INTERVENTION' },
            }),
            prisma.whatsAppChatMessage.findMany({
                where: { direction: 'OUTBOUND', createdAt: { gte: since } },
                select: { id: true, mediaUrl: true, metadata: true },
            }),
            prisma.whatsAppChatMessage.count({
                where: { direction: 'INBOUND', createdAt: { gte: since } },
            }),
            prisma.whatsAppChatMessage.count({
                where: {
                    direction: 'OUTBOUND',
                    createdAt: { gte: since },
                    mediaUrl: { not: null },
                },
            }),
            prisma.whatsAppChatMessage.count({
                where: {
                    direction: 'INBOUND',
                    createdAt: { gte: since },
                    mediaUrl: { not: null },
                },
            }),
            prisma.whatsAppChatMessage.findMany({
                where: { direction: 'OUTBOUND', createdAt: { gte: since } },
                orderBy: { createdAt: 'desc' },
                take: STATUS_SAMPLE_SIZE,
                include: {
                    session: {
                        select: { phone: true, name: true, userType: true },
                    },
                },
            }),
            prisma.memoryGardenOpen.findMany({
                take: 20,
                orderBy: { openedAt: 'desc' },
                include: {
                    order: {
                        select: {
                            orderNumber: true,
                            deceasedName: true,
                        },
                    },
                },
            }),
        ]);

        const veraSessions = Math.max(0, totalSessions - humanSessions);
        const veraUsageRate = pct(veraSessions, totalSessions);
        const humanUsageRate = pct(humanSessions, totalSessions);

        let humanOutbound = 0;
        let veraOutbound = 0;
        let outside24hCount = 0;
        for (const msg of outboundInWindow) {
            const meta = (msg.metadata as Record<string, unknown>) || {};
            if (isHumanOperatorOutbound(meta)) humanOutbound++;
            else veraOutbound++;
            if (isOutside24hTemplate(meta)) outside24hCount++;
        }
        const outboundTotal = outboundInWindow.length;
        const veraMsgRate = pct(veraOutbound, outboundTotal);
        const humanMsgRate = pct(humanOutbound, outboundTotal);

        let sentCount = 0;
        let deliveredCount = 0;
        let readCount = 0;
        let failedCount = 0;
        let trackedWithStatus = 0;

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

        for (const msg of statusSample) {
            const meta = (msg.metadata as Record<string, unknown>) || {};
            const rawStatus = meta.deliveryStatus
                ? String(meta.deliveryStatus).toUpperCase()
                : null;
            const hasError = Boolean(meta.deliveryError) || rawStatus === 'FAILED';

            if (hasError || rawStatus === 'FAILED') {
                failedCount++;
                trackedWithStatus++;
                failedDetails.push({
                    id: msg.id,
                    phone: msg.session?.phone || 'N/D',
                    recipientName: msg.session?.name || 'Utente/Fiorista',
                    userType: msg.session?.userType || 'UNKNOWN',
                    bodyPreview: (msg.body || '').slice(0, 120),
                    deliveryStatus: 'FAILED',
                    deliveryError:
                        (typeof meta.deliveryError === 'string' && meta.deliveryError) ||
                        'Mancata Consegna / Errore Meta API',
                    createdAt: new Date(msg.createdAt).toLocaleString('it-IT'),
                });
                continue;
            }

            if (rawStatus === 'READ') {
                readCount++;
                trackedWithStatus++;
            } else if (rawStatus === 'DELIVERED') {
                deliveredCount++;
                trackedWithStatus++;
            } else {
                // SENZA callback Meta: restano "inviati" (accettati da API) ma non auditati.
                sentCount++;
            }
        }

        const statusSampleSize = statusSample.length;
        const deliveredOrRead = deliveredCount + readCount;
        /** Aperti su quelli con conferma di consegna Meta (DELIVERED+READ). */
        const openOnDeliveredRate = pct(readCount, deliveredOrRead);
        /** Falliti sul campione outbound analizzato. */
        const failedRate = pct(failedCount, statusSampleSize);
        /** Consegnati+letti sul campione (solo dove Meta ha risposto). */
        const deliveredRate = pct(deliveredOrRead, Math.max(trackedWithStatus, 1));
        const readRate = pct(readCount, statusSampleSize);
        const sentOkVsFailedRate =
            statusSampleSize > 0
                ? pct(statusSampleSize - failedCount, statusSampleSize)
                : 100;

        const gdmOpens = recentOpens.map((open) => {
            const deviceInfo = formatDeviceLabel(open.userAgent);
            return {
                id: open.id,
                buyerName: open.buyerName || 'Utente Anonimo',
                buyerEmail: open.buyerEmail || 'N/D',
                orderNumber: open.order?.orderNumber || 'N/D',
                deceasedName: open.order?.deceasedName || 'N/D',
                openedAt: new Date(open.openedAt).toLocaleString('it-IT'),
                device: deviceInfo.device,
                isBot: deviceInfo.isBot,
                deviceHint: deviceInfo.hint || null,
                userAgent: open.userAgent || null,
            };
        });

        return NextResponse.json({
            success: true,
            windowDays: ANALYTICS_WINDOW_DAYS,
            /** Sessioni: VERA vs staff. */
            veraAutonomyRate: veraUsageRate,
            humanEscalationRate: humanUsageRate,
            veraSessions,
            humanSessions,
            totalSessions,
            gdmOpens,
            whatsappAudit: {
                windowDays: ANALYTICS_WINDOW_DAYS,
                /** Totali periodo. */
                outboundTotal,
                inboundTotal: inboundInWindow,
                photosSent: photosOutbound,
                photosReceived: photosInbound,
                outside24hCount,
                outside24hRate: pct(outside24hCount, outboundTotal),
                veraOutbound,
                humanOutbound,
                veraMsgRate,
                humanMsgRate,
                /** Campione status Meta. */
                totalOutbound: statusSampleSize,
                sentCount,
                deliveredCount,
                readCount,
                failedCount,
                trackedWithStatus,
                deliveredOrRead,
                openOnDeliveredRate,
                deliveredRate,
                readRate,
                failedRate,
                sentOkVsFailedRate,
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
                windowDays: ANALYTICS_WINDOW_DAYS,
                veraAutonomyRate: 0,
                humanEscalationRate: 0,
                veraSessions: 0,
                humanSessions: 0,
                totalSessions: 0,
                gdmOpens: [],
                whatsappAudit: {
                    windowDays: ANALYTICS_WINDOW_DAYS,
                    outboundTotal: 0,
                    inboundTotal: 0,
                    photosSent: 0,
                    photosReceived: 0,
                    outside24hCount: 0,
                    outside24hRate: 0,
                    veraOutbound: 0,
                    humanOutbound: 0,
                    veraMsgRate: 0,
                    humanMsgRate: 0,
                    totalOutbound: 0,
                    sentCount: 0,
                    deliveredCount: 0,
                    readCount: 0,
                    failedCount: 0,
                    trackedWithStatus: 0,
                    deliveredOrRead: 0,
                    openOnDeliveredRate: 0,
                    deliveredRate: 0,
                    readRate: 0,
                    failedRate: 0,
                    sentOkVsFailedRate: 100,
                    failedDetails: [],
                },
            },
            { status: 500 }
        );
    }
}
