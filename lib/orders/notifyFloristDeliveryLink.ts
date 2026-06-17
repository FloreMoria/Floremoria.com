import prisma from '@/lib/prisma';
import {
    sendFloristDeliveryLinkToFuturia,
    type FloristDeliveryLinkNotifyResult,
} from '@/lib/futuria/floristDeliveryLinkNotify';

/**
 * Carica ordine + fiorista e invia link mini-app con codice parlante via Futuria/WhatsApp.
 * Fire-and-forget dal PUT ordine dashboard: non blocca la risposta HTTP.
 */
export async function notifyFloristDeliveryLinkForOrder(
    orderId: string
): Promise<FloristDeliveryLinkNotifyResult> {
    const order = await prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        include: {
            partner: {
                select: {
                    shopName: true,
                    ownerName: true,
                    whatsappNumber: true,
                    pecAddress: true,
                    deletedAt: true,
                },
            },
        },
    });

    if (!order) {
        return { ok: false, skipped: 'order_not_found' };
    }
    if (!order.partnerId || !order.partner || order.partner.deletedAt) {
        return { ok: false, skipped: 'no_partner_assigned' };
    }
    if (!order.partner.whatsappNumber?.trim()) {
        return { ok: false, skipped: 'partner_whatsapp_missing' };
    }

    return sendFloristDeliveryLinkToFuturia({
        orderId: order.id,
        orderNumber: order.orderNumber,
        deceasedName: order.deceasedName,
        cemeteryCity: order.cemeteryCity,
        cemeteryName: order.cemeteryName,
        gravePosition: order.gravePosition,
        deliveryDate: order.deliveryDate,
        partnerShopName: order.partner.shopName,
        partnerOwnerName: order.partner.ownerName,
        partnerWhatsapp: order.partner.whatsappNumber,
        partnerEmail: order.partner.pecAddress,
    });
}
