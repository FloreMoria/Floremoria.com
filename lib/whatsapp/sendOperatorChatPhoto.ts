/**
 * Invio foto dallo staff in bacheca WhatsApp.
 * Dentro finestra 24h: messaggio image libero.
 * Fuori finestra: template Meta customer_delivery_photo (header immagine),
 * così la foto parte anche come primo messaggio senza attendere risposta.
 */
import { addMessage, getSession, setSessionStatus } from '@/lib/chatStore';
import { extractFirstNameFromProfile } from '@/lib/vera/genderFromName';
import { uploadChatImageBuffer } from '@/lib/media/uploadChatMedia';
import { requiresTemplateMessage } from '@/lib/whatsapp/messagingWindow';
import {
    normalizePhoneE164,
    sendWhatsAppImageMessage,
} from '@/lib/whatsapp/metaCloudApiClient';
import { sendVeraTemplate } from '@/lib/whatsapp/sendVeraTemplate';
import { buildCustomerDeliveryPhotoParams } from '@/lib/whatsapp/veraTemplateParams';
import { logVeraTemplateOutbound } from '@/lib/whatsapp/logVeraTemplateOutbound';
import { lookupLastOrderByPhone } from '@/lib/whatsapp/orderStatusInquiry';
import { resolvePartnerCity } from '@/lib/whatsapp/deliveryProofCopy';
import { sessionPhoneToE164 } from '@/lib/whatsapp/sessionPhone';

export type OperatorPhotoResult =
    | {
          ok: true;
          session: Awaited<ReturnType<typeof addMessage>>;
          mediaUrl: string;
          mode: 'freetext' | 'template';
      }
    | { ok: false; error: string; requiresTemplate?: boolean; errorCode?: number };

async function resolveOrderContextForPhoto(phoneE164: string) {
    const order = await lookupLastOrderByPhone(phoneE164);
    if (!order) return null;
    return {
        order,
        partnerCity: resolvePartnerCity({
            cemeteryCity: order.cemeteryCity,
            deliveryProvince: order.deliveryProvince,
            cemeteryName: order.cemeteryName,
        }),
    };
}

/**
 * Carica la foto su Blob e la consegna al destinatario (libero o template).
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
    try {
        publicUrl = await uploadChatImageBuffer(input.buffer, sessionPhone);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload immagine fallito.';
        return { ok: false, error: message };
    }

    const needsTemplate = requiresTemplateMessage(session);

    if (!needsTemplate) {
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

        const updatedSession = await addMessage(sessionPhone, 'OUTBOUND', caption || '', publicUrl, {
            source: 'operator',
            outboundMode: input.outboundMode,
            ...(sendResult.messageId ? { whatsAppMessageId: sendResult.messageId } : {}),
        });

        return { ok: true, session: updatedSession, mediaUrl: publicUrl, mode: 'freetext' };
    }

    // Fuori finestra 24h: solo template con header immagine (customer_delivery_photo).
    if (session.userType === 'FLORIST') {
        return {
            ok: false,
            requiresTemplate: true,
            error:
                'Finestra 24h chiusa sul fiorista: Meta non consente foto libere. Attendi il keep-alive a 20h o una sua risposta, poi riprova.',
        };
    }

    const ctx = await resolveOrderContextForPhoto(phoneE164);
    if (!ctx) {
        return {
            ok: false,
            requiresTemplate: true,
            error:
                'Finestra 24h chiusa e nessun ordine collegato a questo numero: impossibile usare il template foto. Avvia una nuova conversazione con template, oppure attendi una risposta dell\'utente.',
        };
    }

    const buyerName = ctx.order.buyerFullName || session.name || 'Utente';
    const bodyParams = buildCustomerDeliveryPhotoParams({
        buyerFirstName: extractFirstNameFromProfile(buyerName),
        partnerCity: ctx.partnerCity,
        deceasedName: ctx.order.deceasedName,
    });

    const templateSend = await sendVeraTemplate(phoneE164, 'customer_delivery_photo', bodyParams, {
        headerImageUrl: publicUrl,
    });

    if (!templateSend.ok) {
        return {
            ok: false,
            requiresTemplate: true,
            error: templateSend.error ?? 'Invio template foto fallito.',
            errorCode: templateSend.errorCode,
        };
    }

    try {
        await logVeraTemplateOutbound({
            phoneE164,
            templateId: 'customer_delivery_photo',
            bodyParams,
            eventType: 'OPERATOR_PHOTO_TEMPLATE',
            orderId: ctx.order.id,
            orderNumber: ctx.order.orderNumber,
            messageId: templateSend.messageId,
            contactName: buyerName,
            userType: 'UTENTE',
        });
    } catch (logErr) {
        console.error('[operator-photo] Log template fallito:', logErr);
    }

    if (session.status === 'AI_ACTIVE') {
        await setSessionStatus(sessionPhone, 'HUMAN_INTERVENTION');
    }

    const bodyForLog =
        caption ||
        `Foto inviata (template post-consegna) — ordine ${ctx.order.orderNumber || ctx.order.id}`;

    const updatedSession = await addMessage(sessionPhone, 'OUTBOUND', bodyForLog, publicUrl, {
        source: 'operator',
        outboundMode: input.outboundMode,
        sendMode: 'template',
        templateId: 'customer_delivery_photo',
        ...(templateSend.messageId ? { whatsAppMessageId: templateSend.messageId } : {}),
    });

    return { ok: true, session: updatedSession, mediaUrl: publicUrl, mode: 'template' };
}
