import { buildMagicPhotoDeliveryUrl } from '@/lib/auth/magicPhotoDelivery';
import { buildFloristDeliveryUrl } from '@/lib/orders/resolveOrderIdentifier';

export function enrichOrderWithShareableLinks<
    T extends { id: string; orderNumber?: string | null },
>(order: T) {
    return {
        ...order,
        floristDeliveryUrl: buildFloristDeliveryUrl(order),
        gdmMagicLinkUrl: buildMagicPhotoDeliveryUrl(order.id),
    };
}
