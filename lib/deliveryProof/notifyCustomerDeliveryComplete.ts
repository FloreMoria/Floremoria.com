import prisma from '@/lib/prisma';
import { sendDeliveryProofWhatsApp } from '@/lib/whatsapp/deliveryProofNotify';
import { getFlatProofPhotoUrls, getOrderProofPhotos } from '@/lib/deliveryProof/proofPhotoUrls';

export interface NotifyCustomerDeliveryCompleteResult {
    ok: boolean;
    skipped?: string;
    giardinoUrl?: string;
    photosSent?: number;
    error?: string;
}

/**
 * Orchestratore post-consegna (Punto E):
 * template `ordine_completato` + MagicLink — senza foto WhatsApp immediate.
 * Le foto Prima/Dopo partono solo su richiesta utente («Inviatemi le foto»).
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

    // Tutte le foto mini-app (prima + dopo), non solo lo slot "dopo".
    const photoUrls = getFlatProofPhotoUrls(order);
    const afterFallback = getOrderProofPhotos(order).after;
    const deliveryPhotoUrls =
        photoUrls.length > 0
            ? photoUrls
            : afterFallback.length > 0
              ? afterFallback
              : order.deliveryProof.photoAfterUrl
                ? [order.deliveryProof.photoAfterUrl]
                : [];

    if (deliveryPhotoUrls.length === 0) {
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
        photoAfterUrl: deliveryPhotoUrls[0],
        photoAfterUrls: deliveryPhotoUrls,
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
