/**
 * Persiste media inbound Meta su Blob permanente.
 * Perché: gli ID media Graph scadono (~30 giorni) e in chat restano placeholder "MEDIA NON DISPONIBILE".
 */
import prisma from '@/lib/prisma';
import { uploadChatImageBuffer } from '@/lib/media/uploadChatMedia';
import { extractWhatsAppMediaId } from '@/lib/whatsapp/chatMediaUrls';
import { fetchWhatsAppMediaFromMeta } from '@/lib/whatsapp/proxyWhatsAppMedia';

function isImageMime(mimeType: string): boolean {
    const m = mimeType.toLowerCase();
    return m.startsWith('image/') || m.includes('webp');
}

/**
 * Se mediaUrl è un proxy Meta, scarica e riscrive il messaggio con URL Blob permanente.
 * Best-effort: errori solo in log, non bloccano il webhook.
 */
export async function persistInboundChatMediaToBlob(input: {
    sessionPhone: string;
    mediaUrl?: string | null;
}): Promise<string | null> {
    const mediaId = extractWhatsAppMediaId(input.mediaUrl);
    if (!mediaId) return null;
    const originalMediaUrl = input.mediaUrl?.trim();
    if (!originalMediaUrl) return null;

    try {
        const { buffer, mimeType } = await fetchWhatsAppMediaFromMeta(mediaId);
        if (!isImageMime(mimeType)) {
            // Audio/video: per ora lasciamo il proxy Meta (scadenza accettata).
            return null;
        }

        const permanentUrl = await uploadChatImageBuffer(
            Buffer.from(buffer),
            input.sessionPhone
        );

        const session = await prisma.whatsAppChatSession.findUnique({
            where: { phone: input.sessionPhone },
            select: { id: true },
        });
        if (!session) return permanentUrl;

        const latest = await prisma.whatsAppChatMessage.findFirst({
            where: {
                sessionId: session.id,
                mediaUrl: originalMediaUrl,
            },
            orderBy: { createdAt: 'desc' },
            select: { id: true },
        });

        if (latest) {
            await prisma.whatsAppChatMessage.update({
                where: { id: latest.id },
                data: { mediaUrl: permanentUrl },
            });
        }

        return permanentUrl;
    } catch (err) {
        console.warn(
            '[chat-media] Persistenza inbound fallita:',
            err instanceof Error ? err.message : err
        );
        return null;
    }
}
