import prisma from '@/lib/prisma';
import type { VeraTemplateId } from '@/lib/whatsapp/veraTemplateRegistry';

/**
 * Dedup outbound VERA: stesso ordine + stesso template = non reiniare.
 * Perché: toggle stato / force accidentali non devono ripetere WhatsApp già spediti.
 */
export async function wasOrderTemplateSent(
    orderId: string,
    templateId: VeraTemplateId,
    orderNumber?: string | null
): Promise<boolean> {
    const byOrderId = await prisma.whatsAppChatMessage.findFirst({
        where: {
            direction: 'OUTBOUND',
            metadata: {
                path: ['orderId'],
                equals: orderId,
            },
            AND: [
                {
                    metadata: {
                        path: ['templateId'],
                        equals: templateId,
                    },
                },
            ],
        },
        select: { id: true },
    });
    if (byOrderId) return true;

    const code = orderNumber?.trim();
    if (!code) return false;

    const byOrderNumber = await prisma.whatsAppChatMessage.findFirst({
        where: {
            direction: 'OUTBOUND',
            metadata: {
                path: ['orderNumber'],
                equals: code,
            },
            AND: [
                {
                    metadata: {
                        path: ['templateId'],
                        equals: templateId,
                    },
                },
            ],
        },
        select: { id: true },
    });
    return Boolean(byOrderNumber);
}

export async function filterUnsentOrderTemplates(
    orderId: string,
    templateIds: VeraTemplateId[],
    orderNumber?: string | null
): Promise<{ pending: VeraTemplateId[]; alreadySent: VeraTemplateId[] }> {
    const alreadySent: VeraTemplateId[] = [];
    const pending: VeraTemplateId[] = [];
    for (const templateId of templateIds) {
        if (await wasOrderTemplateSent(orderId, templateId, orderNumber)) {
            alreadySent.push(templateId);
        } else {
            pending.push(templateId);
        }
    }
    return { pending, alreadySent };
}
