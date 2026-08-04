/**
 * Gestione degli status di consegna Meta WhatsApp Cloud API (wamid).
 * Aggiorna lo stato dei messaggi da SENT a DELIVERED, READ o FAILED nel DB/chatStore.
 *
 * Causa radice storica del mismatch: callback `statuses` spesso arriva prima del
 * commit outbound (race) oppure confronta stringhe wamid non normalizzate.
 * Qui: normalizzazione unica, lookup SQL tollerante, retry + pending apply-on-save.
 */

import prisma from '@/lib/prisma';
import {
    buildOutboundWamidMetadata,
    normalizeWamid,
    shouldApplyDeliveryStatus,
    wamidLookupVariants,
    wamidsMatch,
    type WhatsAppDeliveryStatus,
} from '@/lib/whatsapp/normalizeWamid';

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
    deliveryStatus: WhatsAppDeliveryStatus;
    deliveryError?: string;
    pendingStashed?: boolean;
}

const RETRY_DELAYS_MS = [0, 250, 500, 900, 1500];

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

function mapMetaStatus(rawStatus: string): WhatsAppDeliveryStatus {
    const s = rawStatus.toLowerCase();
    if (s === 'read') return 'READ';
    if (s === 'delivered') return 'DELIVERED';
    if (s === 'failed') return 'FAILED';
    return 'SENT';
}

function hasDatabase(): boolean {
    return Boolean(
        process.env.NODE_ENV === 'production' ||
            process.env.VERCEL === '1' ||
            process.env.DATABASE_URL?.trim()
    );
}

/** Tabella leggera per status arrivati prima del record outbound (no migration Prisma obbligatoria). */
async function ensurePendingStatusTable(): Promise<void> {
    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS whatsapp_delivery_status_pending (
            wamid TEXT PRIMARY KEY,
            delivery_status TEXT NOT NULL,
            delivery_error TEXT,
            error_code TEXT,
            recipient_id TEXT,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
}

async function stashPendingStatus(input: {
    wamid: string;
    deliveryStatus: WhatsAppDeliveryStatus;
    deliveryError?: string;
    errorCode?: string;
    recipientId?: string;
}): Promise<void> {
    await ensurePendingStatusTable();
    await prisma.$executeRawUnsafe(
        `
        INSERT INTO whatsapp_delivery_status_pending
            (wamid, delivery_status, delivery_error, error_code, recipient_id, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (wamid) DO UPDATE SET
            delivery_status = EXCLUDED.delivery_status,
            delivery_error = COALESCE(EXCLUDED.delivery_error, whatsapp_delivery_status_pending.delivery_error),
            error_code = COALESCE(EXCLUDED.error_code, whatsapp_delivery_status_pending.error_code),
            recipient_id = COALESCE(EXCLUDED.recipient_id, whatsapp_delivery_status_pending.recipient_id),
            updated_at = NOW()
        `,
        input.wamid,
        input.deliveryStatus,
        input.deliveryError ?? null,
        input.errorCode ?? null,
        input.recipientId ?? null
    );
}

type MessageRow = {
    id: string;
    metadata: unknown;
};

async function findOutboundByWamid(wamid: string): Promise<MessageRow[]> {
    const variants = wamidLookupVariants(wamid);
    if (variants.length === 0) return [];

    // Lookup primario: path JSON Postgres tollerante a varianti con/senza prefisso.
    const bySql = await prisma.$queryRawUnsafe<MessageRow[]>(
        `
        SELECT id, metadata
        FROM whatsapp_chat_messages
        WHERE direction = 'OUTBOUND'
          AND (
            metadata->>'whatsAppMessageId' = ANY($1::text[])
            OR metadata->>'wamid' = ANY($1::text[])
          )
        ORDER BY created_at DESC
        LIMIT 20
        `,
        variants
    );
    if (bySql.length > 0) return bySql;

    // Fallback Prisma path (equals esatto sulla forma canonica).
    const canonical = normalizeWamid(wamid);
    if (canonical) {
        const byPath = await prisma.whatsAppChatMessage.findMany({
            where: {
                direction: 'OUTBOUND',
                OR: [
                    { metadata: { path: ['whatsAppMessageId'], equals: canonical } },
                    { metadata: { path: ['wamid'], equals: canonical } },
                    {
                        metadata: {
                            path: ['whatsAppMessageId'],
                            equals: canonical.startsWith('wamid.')
                                ? canonical.slice('wamid.'.length)
                                : canonical,
                        },
                    },
                ],
            },
            select: { id: true, metadata: true },
            take: 20,
            orderBy: { createdAt: 'desc' },
        });
        if (byPath.length > 0) return byPath;
    }

    // Ultimo fallback: scan recenti OUTBOUND con match normalizzato in-memory.
    const recentOutbound = await prisma.whatsAppChatMessage.findMany({
        where: { direction: 'OUTBOUND' },
        orderBy: { createdAt: 'desc' },
        take: 120,
        select: { id: true, metadata: true },
    });
    return recentOutbound.filter((msg) => {
        const meta = msg.metadata as Record<string, unknown> | null;
        if (!meta) return false;
        const stored =
            (typeof meta.whatsAppMessageId === 'string' && meta.whatsAppMessageId) ||
            (typeof meta.wamid === 'string' && meta.wamid) ||
            null;
        return wamidsMatch(stored, wamid);
    });
}

async function applyStatusToMessages(input: {
    messages: MessageRow[];
    wamid: string;
    deliveryStatus: WhatsAppDeliveryStatus;
    deliveryError?: string;
    errorCode?: string;
}): Promise<number> {
    let updatedCount = 0;
    const canonical = normalizeWamid(input.wamid) || input.wamid;

    for (const msg of input.messages) {
        const prevMeta = (msg.metadata as Record<string, unknown>) || {};
        const currentStatus =
            typeof prevMeta.deliveryStatus === 'string' ? prevMeta.deliveryStatus : null;
        if (!shouldApplyDeliveryStatus(currentStatus, input.deliveryStatus)) {
            continue;
        }

        const newMeta: Record<string, unknown> = {
            ...prevMeta,
            whatsAppMessageId:
                normalizeWamid(
                    typeof prevMeta.whatsAppMessageId === 'string'
                        ? prevMeta.whatsAppMessageId
                        : canonical
                ) || canonical,
            wamid: canonical,
            deliveryStatus: input.deliveryStatus,
            deliveryStatusUpdatedAt: new Date().toISOString(),
        };
        if (input.deliveryError) newMeta.deliveryError = input.deliveryError;
        if (input.errorCode) newMeta.errorCode = input.errorCode;

        await prisma.whatsAppChatMessage.update({
            where: { id: msg.id },
            data: { metadata: newMeta as object },
        });
        updatedCount++;
    }

    return updatedCount;
}

/**
 * Processa un payload di status da Meta Webhook ('statuses') e aggiorna la chat del destinatario.
 */
export async function processMetaStatusUpdate(
    statusObj: MetaWebhookStatusPayload,
    options?: { skipPendingStash?: boolean; retryDelaysMs?: number[] }
): Promise<ProcessStatusUpdateResult> {
    const wamid = normalizeWamid(statusObj.id) || statusObj.id?.trim() || '';
    if (!wamid) {
        return { ok: false, updatedCount: 0, wamid: '', deliveryStatus: 'SENT' };
    }

    const deliveryStatus = mapMetaStatus(statusObj.status || '');
    let deliveryError = formatMetaStatusError(statusObj.errors);
    if (deliveryStatus === 'FAILED' && !deliveryError) {
        deliveryError =
            'Errore di consegna Meta (Mancata Consegna / Numero non raggiungibile o finestra 24h scaduta)';
    }
    const errorCode = statusObj.errors?.[0]?.code
        ? String(statusObj.errors[0].code)
        : undefined;

    let updatedCount = 0;
    let pendingStashed = false;

    if (hasDatabase()) {
        try {
            const delays = options?.retryDelaysMs ?? RETRY_DELAYS_MS;
            for (let attempt = 0; attempt < delays.length; attempt++) {
                if (delays[attempt] > 0) await sleep(delays[attempt]);
                const messages = await findOutboundByWamid(wamid);
                if (messages.length === 0) continue;

                updatedCount = await applyStatusToMessages({
                    messages,
                    wamid,
                    deliveryStatus,
                    deliveryError,
                    errorCode,
                });
                if (updatedCount > 0) break;
            }

            // Race: status prima del INSERT outbound → stash per apply-on-save.
            if (updatedCount === 0 && !options?.skipPendingStash) {
                await stashPendingStatus({
                    wamid,
                    deliveryStatus,
                    deliveryError,
                    errorCode,
                    recipientId: statusObj.recipient_id,
                });
                pendingStashed = true;
            }
        } catch (err) {
            console.error(`[updateWhatsAppDeliveryStatus] Errore aggiornamento DB per ${wamid}:`, err);
        }
    }

    console.info(
        `[wa-status-webhook] ${wamid} → ${deliveryStatus} (aggiornati ${updatedCount} record)${
            pendingStashed ? ' [pending-stash]' : ''
        }${deliveryError ? ` [${deliveryError}]` : ''}`
    );

    return {
        ok: true,
        updatedCount,
        wamid,
        deliveryStatus,
        deliveryError,
        pendingStashed,
    };
}

/**
 * Dopo il salvataggio outbound: applica eventuali status Meta arrivati in anticipo.
 * Perché: Meta può notificare DELIVERED prima che addMessage abbia committato il wamid.
 */
export async function applyPendingDeliveryStatusForWamid(
    messageId: string | null | undefined
): Promise<boolean> {
    const wamid = normalizeWamid(messageId);
    if (!wamid || !hasDatabase()) return false;

    try {
        await ensurePendingStatusTable();
        const variants = wamidLookupVariants(wamid);
        const rows = await prisma.$queryRawUnsafe<
            Array<{
                wamid: string;
                delivery_status: string;
                delivery_error: string | null;
                error_code: string | null;
            }>
        >(
            `
            SELECT wamid, delivery_status, delivery_error, error_code
            FROM whatsapp_delivery_status_pending
            WHERE wamid = ANY($1::text[])
            LIMIT 5
            `,
            variants
        );
        if (!rows.length) return false;

        let applied = false;
        for (const row of rows) {
            const result = await processMetaStatusUpdate(
                {
                    id: row.wamid,
                    status: row.delivery_status.toLowerCase(),
                    errors: row.delivery_error
                        ? [{ message: row.delivery_error, code: row.error_code ? Number(row.error_code) : undefined }]
                        : undefined,
                },
                { skipPendingStash: true, retryDelaysMs: [0, 200, 400] }
            );
            if (result.updatedCount > 0) {
                applied = true;
                await prisma.$executeRawUnsafe(
                    `DELETE FROM whatsapp_delivery_status_pending WHERE wamid = $1`,
                    row.wamid
                );
            }
        }
        return applied;
    } catch (err) {
        console.warn('[wa-status-pending] apply fallita:', err);
        return false;
    }
}

export { buildOutboundWamidMetadata, normalizeWamid };
