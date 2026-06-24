import prisma from '@/lib/prisma';
import { buildFloristDeliveryWhatsAppText } from '@/lib/orders/floristDeliveryLinkMessage';
import { buildFloristDeliveryUrl } from '@/lib/orders/resolveOrderIdentifier';
import { sendWhatsAppTextMessage } from '@/lib/whatsapp/metaCloudApiClient';
import {
    sendFloristDeliveryLinkToFuturia,
    type FloristDeliveryLinkNotifyResult,
} from '@/lib/futuria/floristDeliveryLinkNotify';

/**
 * Carica ordine + fiorista e invia link mini-app via Futuria/WhatsApp
 * (fallback Meta Cloud API se Futuria non configurato).
 * Fire-and-forget dal PUT ordine dashboard: non blocca la risposta HTTP.
 */
export async function notifyFloristDeliveryLinkForOrder(
    orderId: string
): Promise<FloristDeliveryLinkNotifyResult | { ok: true; deliveryUrl: string; channel: 'meta_cloud' }> {
    const order = await prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        include: {
            partner: {
                select: {
                    shopName: true,
                    ownerName: true,
                    whatsappNumber: true,
                    email: true,
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

    const deliveryUrl = buildFloristDeliveryUrl({
        id: order.id,
        orderNumber: order.orderNumber,
    });
    const deliveryDateLabel = order.deliveryDate
        ? order.deliveryDate.toLocaleDateString('it-IT')
        : 'Da programmare';

    const futuriaResult = await sendFloristDeliveryLinkToFuturia({
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
        partnerEmail: order.partner.email || order.partner.pecAddress,
    });

    if (futuriaResult.ok || futuriaResult.skipped !== 'futuria_not_configured') {
        return futuriaResult;
    }

    const message = buildFloristDeliveryWhatsAppText({
        codice_ordine: order.orderNumber,
        nome_defunto: order.deceasedName,
        cimitero: order.cemeteryName,
        comune_cimitero: order.cemeteryCity,
        posizione_tomba: order.gravePosition,
        data_consegna: deliveryDateLabel,
        deliveryUrl,
    });

    const metaSend = await sendWhatsAppTextMessage(order.partner.whatsappNumber, message);
    if (!metaSend.ok) {
        console.error(
            `[florist-delivery-link] Meta Cloud fallback fallito ordine ${order.orderNumber || order.id}:`,
            metaSend.error
        );
        return { ok: false, skipped: metaSend.error ?? 'meta_send_failed' };
    }

    console.info(
        `[florist-delivery-link] Meta Cloud WhatsApp OK order=${order.orderNumber || order.id} url=${deliveryUrl}`
    );

    return { ok: true, deliveryUrl, channel: 'meta_cloud' };
}
