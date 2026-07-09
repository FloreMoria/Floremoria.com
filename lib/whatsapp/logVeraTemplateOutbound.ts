import { addMessage, updateSessionProfile } from '@/lib/chatStore';
import { getVeraTemplate, type VeraTemplateId } from '@/lib/whatsapp/veraTemplateRegistry';

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

    await addMessage(sessionPhone, 'OUTBOUND', preview, undefined, {
        eventType: input.eventType,
        outboundMode: 'template',
        templateId: input.templateId,
        ...(input.orderId ? { orderId: input.orderId } : {}),
        ...(input.orderNumber ? { orderNumber: input.orderNumber } : {}),
        ...(input.messageId ? { whatsAppMessageId: input.messageId } : {}),
    }).catch(() => undefined);

    if (input.contactName || input.userType) {
        await updateSessionProfile(sessionPhone, {
            ...(input.contactName ? { name: input.contactName } : {}),
            ...(input.userType ? { userType: input.userType } : {}),
        }).catch(() => undefined);
    }
}
