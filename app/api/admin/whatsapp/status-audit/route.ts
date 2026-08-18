import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { normalizePhoneE164 } from '@/lib/whatsapp/metaCloudApiClient';

import { purgeOldWebhookDeliveryErrors } from '@/lib/whatsapp/purgeDeliveryLogs';

export const dynamic = 'force-dynamic';

export async function GET() {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        await purgeOldWebhookDeliveryErrors(7);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const outboundMessages = await prisma.whatsAppChatMessage.findMany({
            where: { direction: 'OUTBOUND', createdAt: { gte: sevenDaysAgo } },
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
        let malformedPhoneCount = 0;

        const failedDetails: Array<{
            id: string;
            phone: string;
            recipientName: string;
            userType: string;
            bodyPreview: string;
            deliveryStatus: string;
            deliveryError?: string;
            errorCode?: string;
            wamid?: string;
            createdAt: string;
        }> = [];

        for (const msg of outboundMessages) {
            const meta = (msg.metadata as Record<string, any>) || {};
            const status = (meta.deliveryStatus || 'SENT').toUpperCase();
            const hasError = Boolean(meta.deliveryError) || status === 'FAILED';
            const rawPhone = msg.session?.phone || '';
            const e164 = normalizePhoneE164(rawPhone);

            if (!e164 || !rawPhone.startsWith('whatsapp:+')) {
                malformedPhoneCount++;
            }

            if (hasError || status === 'FAILED') {
                failedCount++;
                failedDetails.push({
                    id: msg.id,
                    phone: rawPhone,
                    recipientName: msg.session?.name || 'Sconosciuto',
                    userType: msg.session?.userType || 'UNKNOWN',
                    bodyPreview: msg.body.slice(0, 100),
                    deliveryStatus: 'FAILED',
                    deliveryError: meta.deliveryError || 'Mancata Consegna / Meta API Error',
                    errorCode: meta.errorCode || undefined,
                    wamid: meta.whatsAppMessageId || meta.wamid || undefined,
                    createdAt: msg.createdAt.toISOString(),
                });
            } else if (status === 'READ') {
                readCount++;
            } else if (status === 'DELIVERED') {
                deliveredCount++;
            } else {
                sentCount++;
            }
        }

        return NextResponse.json({
            success: true,
            auditedAt: new Date().toISOString(),
            summary: {
                totalAudited: outboundMessages.length,
                sent: sentCount,
                delivered: deliveredCount,
                read: readCount,
                failed: failedCount,
                malformedPhoneNumbers: malformedPhoneCount,
            },
            failedDetails,
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[whatsapp-status-audit] Error:', message);
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
