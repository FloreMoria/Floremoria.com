import prisma from '@/lib/prisma';
import { sendDeliveryProofWhatsApp } from '@/lib/whatsapp/deliveryProofNotify';
import { getOrderProofPhotos } from '@/lib/deliveryProof/proofPhotoUrls';

export interface NotifyCustomerDeliveryCompleteResult {
    ok: boolean;
    skipped?: string;
    giardinoUrl?: string;
    photosSent?: number;
    error?: string;
}

/**
 * Orchestratore post-consegna: invia TUTTE le foto e il messaggio all'utente (Punto E).
 * Il ringraziamento al fiorista (Punto F) è gestito da runPuntoEFDeliveryComplete.
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

    const afterPhotos = getOrderProofPhotos(order).after;
    const photoAfterUrls =
        afterPhotos.length > 0
            ? afterPhotos
            : order.deliveryProof.photoAfterUrl
              ? [order.deliveryProof.photoAfterUrl]
              : [];

    if (photoAfterUrls.length === 0) {
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
        photoAfterUrl: photoAfterUrls[0],
        photoAfterUrls,
    });

    if (!result.ok) {
        return {
            ok: false,
            skipped: result.skipped,
            giardinoUrl: result.giardinoUrl,
            photosSent: result.photosSent,
            error: result.error,
        };
    }

    return {
        ok: true,
        giardinoUrl: result.giardinoUrl,
        photosSent: result.photosSent,
    };
}
