/**
 * Gestione degli status di consegna Meta WhatsApp Cloud API (wamid).
 * Aggiorna lo stato dei messaggi da SENT a DELIVERED, READ o FAILED nel DB/chatStore.
 */

import prisma from '@/lib/prisma';

export interface MetaStatusError {
    code?: number;
    title?: string;
    message?: string;
    error_data?: { details?: string };
}

export interface MetaWebhookStatusPayload {
    id: string; // wamid
    status: 'sent' | 'delivered' | 'read' | 'failed' | string;
    timestamp?: string;
    recipient_id?: string;
    errors?: MetaStatusError[];
}

export interface ProcessStatusUpdateResult {
    ok: boolean;
    updatedCount: number;
    wamid: string;
    deliveryStatus: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
    deliveryError?: string;
}

export function formatMetaStatusError(errors?: MetaStatusError[]): string | undefined {
    if (!errors || errors.length === 0) return undefined;
    return errors
        .map((e) => {
            const code = e.code ? `Errore Meta ${e.code}` : 'Errore Meta';
            const title = e.title || e.message || 'Mancata Consegna';
            const details = e.error_data?.details ? ` (${e.error_data.details})` : '';
            return `${code}: ${title}${details}`.trim();
        })
        .join(' | ');
}

/**
 * Processa un payload di status da Meta Webhook ('statuses') e aggiorna la chat del destinatario.
 */
export async function processMetaStatusUpdate(
    statusObj: MetaWebhookStatusPayload
): Promise<ProcessStatusUpdateResult> {
    const wamid = statusObj.id?.trim();
    if (!wamid) {
        return { ok: false, updatedCount: 0, wamid: '', deliveryStatus: 'SENT' };
    }

    const rawStatus = (statusObj.status || '').toLowerCase();
    let deliveryStatus: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' = 'SENT';

    if (rawStatus === 'read') deliveryStatus = 'READ';
    else if (rawStatus === 'delivered') deliveryStatus = 'DELIVERED';
    else if (rawStatus === 'failed') deliveryStatus = 'FAILED';
    else if (rawStatus === 'sent') deliveryStatus = 'SENT';

    let deliveryError = formatMetaStatusError(statusObj.errors);
    if (deliveryStatus === 'FAILED' && !deliveryError) {
        deliveryError = 'Errore di consegna Meta (Mancata Consegna / Numero non raggiungibile o finestra 24h scaduta)';
    }

    let updatedCount = 0;
    const hasDb = Boolean(process.env.NODE_ENV === 'production' || process.env.VERCEL === '1' || process.env.DATABASE_URL?.trim());

    if (hasDb) {
        try {
            // 1. Cerca messaggi con whatsAppMessageId corrispondente nel campo metadata JSON
            const matchingMessages = await prisma.whatsAppChatMessage.findMany({
                where: {
                    direction: 'OUTBOUND',
                    metadata: {
                        path: ['whatsAppMessageId'],
                        equals: wamid,
                    },
                },
                take: 10,
            });

            const messagesToUpdate = [...matchingMessages];

            // 2. Fallback: se la query JSON non trova risultati, cerca nei recenti OUTBOUND se metadata coincide
            if (messagesToUpdate.length === 0) {
                const recentOutbound = await prisma.whatsAppChatMessage.findMany({
                    where: { direction: 'OUTBOUND' },
                    orderBy: { createdAt: 'desc' },
                    take: 40,
                });
                for (const msg of recentOutbound) {
                    const meta = msg.metadata as Record<string, unknown> | null;
                    if (meta && (meta.whatsAppMessageId === wamid || meta.wamid === wamid)) {
                        messagesToUpdate.push(msg);
                    }
                }
            }

            // 3. Aggiorna lo stato nel DB Prisma
            for (const msg of messagesToUpdate) {
                const prevMeta = (msg.metadata as Record<string, unknown>) || {};
                const newMeta = {
                    ...prevMeta,
                    deliveryStatus,
                    ...(deliveryError ? { deliveryError } : {}),
                    ...(statusObj.errors?.[0]?.code ? { errorCode: String(statusObj.errors[0].code) } : {}),
                    deliveryStatusUpdatedAt: new Date().toISOString(),
                };

                await prisma.whatsAppChatMessage.update({
                    where: { id: msg.id },
                    data: { metadata: newMeta },
                });
                updatedCount++;
            }
        } catch (err) {
            console.error(`[updateWhatsAppDeliveryStatus] Errore aggiornamento DB per ${wamid}:`, err);
        }
    }

    console.info(
        `[wa-status-webhook] ${wamid} → ${deliveryStatus} (aggiornati ${updatedCount} record)${
            deliveryError ? ` [${deliveryError}]` : ''
        }`
    );

    return {
        ok: true,
        updatedCount,
        wamid,
        deliveryStatus,
        deliveryError,
    };
}
