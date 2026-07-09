import webpush from 'web-push';
import prisma from '@/lib/prisma';

export interface StaffPushPayload {
    title: string;
    body: string;
    url?: string;
    tag?: string;
}

function configureVapid(): boolean {
    const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
    const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
    const subject =
        process.env.VAPID_SUBJECT?.trim() || 'mailto:assistenza@floremoria.com';

    if (!publicKey || !privateKey) {
        return false;
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);
    return true;
}

export function getVapidPublicKey(): string | null {
    return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

export function isStaffPushConfigured(): boolean {
    return Boolean(getVapidPublicKey() && process.env.VAPID_PRIVATE_KEY?.trim());
}

export async function saveStaffPushSubscription(input: {
    endpoint: string;
    p256dh: string;
    auth: string;
}): Promise<void> {
    await prisma.staffPushSubscription.upsert({
        where: { endpoint: input.endpoint },
        create: {
            endpoint: input.endpoint,
            p256dh: input.p256dh,
            auth: input.auth,
        },
        update: {
            p256dh: input.p256dh,
            auth: input.auth,
        },
    });
}

export async function removeStaffPushSubscription(endpoint: string): Promise<void> {
    await prisma.staffPushSubscription.deleteMany({ where: { endpoint } });
}

export async function sendStaffPushNotification(payload: StaffPushPayload): Promise<{
    sent: number;
    failed: number;
    skipped: boolean;
}> {
    if (!configureVapid()) {
        return { sent: 0, failed: 0, skipped: true };
    }

    const subs = await prisma.staffPushSubscription.findMany();
    if (!subs.length) {
        return { sent: 0, failed: 0, skipped: false };
    }

    const body = JSON.stringify({
        title: payload.title,
        body: payload.body,
        url: payload.url || '/dashboard/communications',
        tag: payload.tag || 'fm-whatsapp',
    });

    let sent = 0;
    let failed = 0;

    await Promise.all(
        subs.map(async (sub) => {
            try {
                await webpush.sendNotification(
                    {
                        endpoint: sub.endpoint,
                        keys: { p256dh: sub.p256dh, auth: sub.auth },
                    },
                    body,
                    { TTL: 60 * 60 }
                );
                sent += 1;
            } catch (err: unknown) {
                failed += 1;
                const status = (err as { statusCode?: number })?.statusCode;
                if (status === 404 || status === 410) {
                    await prisma.staffPushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
                }
                console.warn('[staff-push] Invio fallito:', status, sub.endpoint.slice(0, 48));
            }
        })
    );

    return { sent, failed, skipped: false };
}

function formatUserTypeLabel(userType?: string): string {
    if (userType === 'FLORIST') return 'Fiorista';
    if (userType === 'UTENTE') return 'Utente';
    return 'Contatto';
}

/** Avvisa lo staff quando arriva un messaggio WhatsApp in entrata. */
export async function notifyStaffOfWhatsAppInbound(input: {
    senderName: string;
    phoneE164: string;
    messagePreview: string;
    userType?: string;
    escalated?: boolean;
}): Promise<void> {
    const typeLabel = formatUserTypeLabel(input.userType);
    const preview = (input.messagePreview || '[messaggio]').trim().slice(0, 180);
    const title = input.escalated
        ? `🚨 WhatsApp — ${typeLabel} (escalation)`
        : `📱 WhatsApp — ${typeLabel}`;

    const body = `${input.senderName || input.phoneE164}: ${preview}`;

    await sendStaffPushNotification({
        title,
        body,
        url: '/dashboard/communications',
        tag: `wa-${input.phoneE164.replace(/\D/g, '')}`,
    });
}
