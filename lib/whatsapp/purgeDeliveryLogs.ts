import prisma from '@/lib/prisma';

export interface PurgeLogsResult {
    ok: boolean;
    purgedPendingCount: number;
    retentionDays: number;
    cutoffDate: string;
}

/**
 * Routine di Auto-Purge dei log del Registro Mancata Consegna & Errori Webhook Meta.
 * Elimina fisicamente (DELETE) i record di status pending ed errori webhook più vecchi di N giorni (default 7).
 */
export async function purgeOldWebhookDeliveryErrors(retentionDays = 7): Promise<PurgeLogsResult> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    let purgedPendingCount = 0;

    try {
        // DELETE fisica dei record di status pending webhook Meta più vecchi di retentionDays
        const deleted = await prisma.$executeRawUnsafe(
            `DELETE FROM whatsapp_delivery_status_pending WHERE updated_at < $1`,
            cutoffDate
        );
        purgedPendingCount = typeof deleted === 'number' ? deleted : 0;
    } catch {
        // La tabella whatsapp_delivery_status_pending viene creata al primo evento pending
    }

    return {
        ok: true,
        purgedPendingCount,
        retentionDays,
        cutoffDate: cutoffDate.toISOString(),
    };
}
