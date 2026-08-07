/**
 * Invio foto dallo staff in bacheca WhatsApp.
 * Dentro finestra 24h: messaggio image libero.
 * Fuori finestra: Meta non consente image free-text (131047);
 * il template floremoria_consegna_foto_utente è solo testo+MagicLink (no header foto).
 */
import { addMessage, getSession, setSessionStatus } from '@/lib/chatStore';
import { uploadChatImageBuffer } from '@/lib/media/uploadChatMedia';
import { ensureWhatsAppImageUrlFromBuffer } from '@/lib/whatsapp/deliveryImageStaging';
import { requiresTemplateMessage } from '@/lib/whatsapp/messagingWindow';
import {
    normalizePhoneE164,
    sendWhatsAppImageMessage,
} from '@/lib/whatsapp/metaCloudApiClient';
import { buildOutboundWamidMetadata } from '@/lib/whatsapp/normalizeWamid';
import { sessionPhoneToE164 } from '@/lib/whatsapp/sessionPhone';

export type OperatorPhotoResult =
    | {
          ok: true;
          session: Awaited<ReturnType<typeof addMessage>>;
          mediaUrl: string;
          mode: 'freetext' | 'template';
      }
    | { ok: false; error: string; requiresTemplate?: boolean; errorCode?: number };

/**
 * Carica la foto su Blob e la consegna al destinatario (libero se finestra 24h aperta).
 */
export async function sendOperatorChatPhoto(input: {
    sessionPhone: string;
    buffer: Buffer;
    caption?: string;
    outboundMode: 'photo' | 'forward';
}): Promise<OperatorPhotoResult> {
    const phoneE164 = sessionPhoneToE164(input.sessionPhone) || normalizePhoneE164(input.sessionPhone);
    if (!phoneE164) {
        return { ok: false, error: 'Numero destinatario non valido.' };
    }

    const sessionPhone = `whatsapp:${phoneE164}`;
    const session = await getSession(sessionPhone);
    const caption = (input.caption || '').trim();

    let publicUrl: string;
    let dashboardMediaUrl: string;
    try {
        dashboardMediaUrl = await uploadChatImageBuffer(input.buffer, sessionPhone);
        publicUrl = await ensureWhatsAppImageUrlFromBuffer(
            phoneE164.replace(/\D/g, '') || 'chat',
            input.buffer
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload immagine fallito.';
        return { ok: false, error: message };
    }

    const needsTemplate = requiresTemplateMessage(session);

    if (needsTemplate) {
        return {
            ok: false,
            requiresTemplate: true,
            error:
                'Finestra 24h chiusa: Meta blocca le foto libere (131047). ' +
                'Il template floremoria_consegna_foto_utente non ha header immagine: attendi una risposta dell\'utente (riapre la finestra) e riprova, oppure reinoltra il MagicLink.',
        };
    }

    const sendResult = await sendWhatsAppImageMessage(sessionPhone, publicUrl, caption || undefined);
    if (!sendResult.ok) {
        return {
            ok: false,
            error: sendResult.error ?? 'Invio foto WhatsApp fallito.',
            errorCode: sendResult.errorCode,
        };
    }

    if (session.status === 'AI_ACTIVE') {
        await setSessionStatus(sessionPhone, 'HUMAN_INTERVENTION');
    }

    const updatedSession = await addMessage(sessionPhone, 'OUTBOUND', caption || '', dashboardMediaUrl, {
        source: 'operator',
        outboundMode: input.outboundMode,
        ...buildOutboundWamidMetadata(sendResult.messageId),
    });

    return { ok: true, session: updatedSession, mediaUrl: dashboardMediaUrl, mode: 'freetext' };
}
