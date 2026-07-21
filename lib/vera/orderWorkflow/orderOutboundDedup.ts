import prisma from '@/lib/prisma';
import type { VeraTemplateId } from '@/lib/whatsapp/veraTemplateRegistry';

const EVENT_TYPE_BY_TEMPLATE: Partial<Record<VeraTemplateId, string>> = {
    customer_order_confirm: 'ORDER_CONFIRM_TEMPLATE',
    florist_first_001: 'FLORIST_NEW_ORDER_TEMPLATE',
    florist_first_002: 'FLORIST_NEW_ORDER_TEMPLATE',
    florist_first_003: 'FLORIST_NEW_ORDER_TEMPLATE',
    florist_first_004: 'FLORIST_NEW_ORDER_TEMPLATE',
};

/**
 * Dedup robusto via SQL su metadata JSON (stesso ordine + stesso template/eventType).
 * Perché: il filtro Prisma `path` non è affidabile al 100% su Json; i duplicati sono gravi.
 */
export async function wasOrderTemplateSent(
    orderId: string,
    templateId: VeraTemplateId,
    orderNumber?: string | null
): Promise<boolean> {
    const eventType = EVENT_TYPE_BY_TEMPLATE[templateId] ?? null;
    const code = orderNumber?.trim() || null;

    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM whatsapp_chat_messages
        WHERE direction = 'OUTBOUND'
          AND metadata IS NOT NULL
          AND (
            metadata->>'orderId' = ${orderId}
            OR (${code}::text IS NOT NULL AND metadata->>'orderNumber' = ${code})
          )
          AND (
            metadata->>'templateId' = ${templateId}
            OR (${eventType}::text IS NOT NULL AND metadata->>'eventType' = ${eventType}
                AND (
                  ${templateId} = 'customer_order_confirm'
                  OR metadata->>'templateId' = ${templateId}
                ))
          )
        LIMIT 1
    `;
    if (rows.length > 0) return true;

    // Fallback testo: benvenuto cliente già presente in chat (anche log legacy senza templateId).
    if (templateId === 'customer_order_confirm' && code) {
        const legacy = await prisma.$queryRaw<Array<{ id: string }>>`
            SELECT m.id
            FROM whatsapp_chat_messages m
            WHERE m.direction = 'OUTBOUND'
              AND (
                m.body ILIKE '%partner di fiducia di zona%'
                OR m.body ILIKE '%preso in carico il Suo omaggio%'
              )
              AND (
                m.metadata->>'orderId' = ${orderId}
                OR m.metadata->>'orderNumber' = ${code}
                OR m.body ILIKE ${'%' + code + '%'}
              )
            LIMIT 1
        `;
        if (legacy.length > 0) return true;
    }

    return false;
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
