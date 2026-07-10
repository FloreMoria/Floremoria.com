import { addMessage, updateSessionProfile, markChatSessionAsTest } from '@/lib/chatStore';
import prisma from '@/lib/prisma';
import { getVeraTemplate, type VeraTemplateId } from '@/lib/whatsapp/veraTemplateRegistry';
import { buildContactInitials } from '@/lib/whatsapp/sessionPhone';

const TEMPLATE_BODY_ENV: Partial<Record<VeraTemplateId, string>> = {
    customer_order_confirm: 'WHATSAPP_TEMPLATE_CUSTOMER_ORDER_CONFIRM_BODY',
    customer_waiting_update: 'WHATSAPP_TEMPLATE_CUSTOMER_WAITING_UPDATE_BODY',
    customer_delivery_photo: 'WHATSAPP_TEMPLATE_CUSTOMER_DELIVERY_PHOTO_BODY',
    florist_reminder: 'WHATSAPP_TEMPLATE_FLORIST_REMINDER_BODY',
};

/** Anteprima testo template con {{1}}, {{2}}, … sostituiti per la cronologia chat dashboard. */
export function renderVeraTemplateBodyPreview(
    templateId: VeraTemplateId,
    bodyParams: string[]
): string {
    const spec = getVeraTemplate(templateId);
    const envKey = TEMPLATE_BODY_ENV[templateId];
    let template = (envKey ? process.env[envKey]?.trim() : '') || spec.bodyCanonical;

    return bodyParams.reduce((text, param, index) => {
        return text.replace(new RegExp(`\\{\\{${index + 1}\\}\\}`, 'g'), param);
    }, template);
}

/**
 * Registra in dashboard una sessione chat attiva subito dopo l'invio template VERA.
 * Non attende la risposta inbound: la conversazione è visibile in /dashboard/communications.
 */
export async function logVeraTemplateOutbound(input: {
    phoneE164: string;
    templateId: VeraTemplateId;
    bodyParams: string[];
    eventType: string;
    orderId?: string;
    orderNumber?: string | null;
    messageId?: string;
    contactName?: string;
    userType?: 'UTENTE' | 'FLORIST';
}): Promise<void> {
    const sessionPhone = `whatsapp:${input.phoneE164}`;
    const preview = renderVeraTemplateBodyPreview(input.templateId, input.bodyParams);
    const contactName = input.contactName?.trim();

    try {
        await addMessage(sessionPhone, 'OUTBOUND', preview, undefined, {
            eventType: input.eventType,
            outboundMode: 'template',
            templateId: input.templateId,
            ...(input.orderId ? { orderId: input.orderId } : {}),
            ...(input.orderNumber ? { orderNumber: input.orderNumber } : {}),
            ...(input.messageId ? { whatsAppMessageId: input.messageId } : {}),
        });

        await updateSessionProfile(sessionPhone, {
            ...(contactName ? { name: contactName, initials: buildContactInitials(contactName) } : {}),
            ...(input.userType ? { userType: input.userType } : {}),
            status: 'AI_ACTIVE',
            welcomeSent: true,
        });

        if (input.orderId) {
            const order = await prisma.order.findUnique({
                where: { id: input.orderId },
                select: { isTest: true },
            });
            if (order?.isTest) {
                await markChatSessionAsTest(sessionPhone);
            }
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[vera-template-log] Impossibile registrare sessione chat dashboard:', {
            sessionPhone,
            templateId: input.templateId,
            eventType: input.eventType,
            orderId: input.orderId,
            error: message,
        });
        throw err;
    }
}
