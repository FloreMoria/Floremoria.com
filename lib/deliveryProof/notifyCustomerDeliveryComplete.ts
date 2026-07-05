import prisma from '@/lib/prisma';
import { sendDeliveryProofWhatsApp } from '@/lib/whatsapp/deliveryProofNotify';

export interface NotifyCustomerDeliveryCompleteResult {
    ok: boolean;
    skipped?: string;
    giardinoUrl?: string;
    error?: string;
}

/**
 * Orchestratore unico post-consegna: notifica WhatsApp nativa VERA (Meta Cloud API).
 * Set-and-Forget: non propaga eccezioni al chiamante upload proof.
 */
export async function notifyCustomerDeliveryComplete(
    orderId: string
): Promise<NotifyCustomerDeliveryCompleteResult> {
    const order = await prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        include: {
            deliveryProof: true,
            user: { select: { name: true, email: true } },
        },
    });

    if (!order) {
        return { ok: false, skipped: 'order_not_found' };
    }

    if (order.deliveryProof?.status !== 'COMPLETED') {
        return { ok: false, skipped: 'proof_not_completed' };
    }

    const photoAfterUrl =
        order.deliveryProof.photoAfterUrl ||
        order.deliveryProof.photosAfterUrls?.[0] ||
        null;

    if (!photoAfterUrl) {
        return { ok: false, skipped: 'missing_after_photo' };
    }

    const result = await sendDeliveryProofWhatsApp({
        orderId: order.id,
        orderNumber: order.orderNumber,
        buyerFullName: order.user?.name || order.buyerFullName,
        customerPhone: order.customerPhone,
        deceasedName: order.deceasedName,
        cemeteryCity: order.cemeteryCity,
        cemeteryName: order.cemeteryName,
        deliveryProvince: order.deliveryProvince,
        photoAfterUrl,
    });

    if (!result.ok) {
        return {
            ok: false,
            skipped: result.skipped,
            giardinoUrl: result.giardinoUrl,
            error: result.error,
        };
    }

    return { ok: true, giardinoUrl: result.giardinoUrl };
}
