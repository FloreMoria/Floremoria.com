import type { DeliveryProofStatus, Order, PaymentStatus } from '@prisma/client';

/** Ordine AF di test — accesso mini-app sempre aperto fino a rimozione esplicita. */
export const FLORIST_TEST_ORDER_ID = 'cmqgpyptm0001i6041bwgjpjg';
export const FLORIST_TEST_ORDER_NUMBER = 'PT-UD-26-002';

/** Riconosce il riferimento URL (CUID o codice parlante) senza query al database. */
export function isFloristTestOrderRef(ref: string): boolean {
    const trimmed = ref.trim();
    if (!trimmed) return false;
    return (
        trimmed === FLORIST_TEST_ORDER_ID ||
        trimmed.toUpperCase() === FLORIST_TEST_ORDER_NUMBER.toUpperCase()
    );
}

export function isFloristTestOrder(order: Pick<Order, 'id' | 'orderNumber'>): boolean {
    return order.id === FLORIST_TEST_ORDER_ID || order.orderNumber === FLORIST_TEST_ORDER_NUMBER;
}

export type FloristDeliveryProofSnapshot = {
    status: DeliveryProofStatus;
    photosBeforeUrls?: string[];
    photosAfterUrls?: string[];
    photoBeforeUrl?: string | null;
    photoAfterUrl?: string | null;
    gpsLatitude?: number | null;
    gpsLongitude?: number | null;
};

export type FloristOrderAccessSnapshot = Pick<
    Order,
    'id' | 'orderNumber' | 'status' | 'updatedAt' | 'deletedAt' | 'partnerPaymentStatus' | 'latitude' | 'longitude'
> & {
    deliveryProof?: FloristDeliveryProofSnapshot | null;
};

export type FloristAccessResult =
    | { allowed: true; reason: 'in_progress' | 'completed_view' | 'test_bypass' }
    | { allowed: false; reason: 'not_found' | 'cancelled' | 'pending_unpaid' };

function countProofPhotos(proof: FloristDeliveryProofSnapshot, slot: 'before' | 'after'): number {
    if (slot === 'before') {
        const fromArray = proof.photosBeforeUrls?.filter(Boolean).length ?? 0;
        if (fromArray > 0) return fromArray;
        return proof.photoBeforeUrl ? 1 : 0;
    }
    const fromArray = proof.photosAfterUrls?.filter(Boolean).length ?? 0;
    if (fromArray > 0) return fromArray;
    return proof.photoAfterUrl ? 1 : 0;
}

function hasSavedGps(
    order: Pick<Order, 'latitude' | 'longitude'>,
    proof: FloristDeliveryProofSnapshot
): boolean {
    const lat = proof.gpsLatitude ?? order.latitude;
    const lng = proof.gpsLongitude ?? order.longitude;
    return lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);
}

/**
 * Consegna definitiva solo se foto Prima+Dopo, GPS e ordine COMPLETED sono tutti presenti.
 */
export function isFloristDeliveryFullyComplete(
    order: Pick<Order, 'status' | 'latitude' | 'longitude'>,
    proof: FloristDeliveryProofSnapshot | null | undefined
): boolean {
    if (order.status !== 'COMPLETED' || !proof || proof.status !== 'COMPLETED') {
        return false;
    }
    if (countProofPhotos(proof, 'before') < 1 || countProofPhotos(proof, 'after') < 1) {
        return false;
    }
    return hasSavedGps(order, proof);
}

/**
 * Link mini-app sempre riapribile finché la consegna non è completata al 100%.
 * Nessuna scadenza temporale né invalidazione al primo accesso.
 */
export function evaluateFloristDeliveryAccess(
    order: Pick<Order, 'id' | 'orderNumber' | 'status' | 'deletedAt' | 'partnerPaymentStatus'> | null,
    publicRef?: string
): FloristAccessResult {
    if (publicRef && isFloristTestOrderRef(publicRef)) {
        return { allowed: true, reason: 'test_bypass' };
    }
    if (order && isFloristTestOrder(order)) {
        return { allowed: true, reason: 'test_bypass' };
    }
    if (!order || order.deletedAt) {
        return { allowed: false, reason: 'not_found' };
    }
    if (order.status === 'CANCELLED') {
        return { allowed: false, reason: 'cancelled' };
    }
    if (order.status === 'PENDING' && order.partnerPaymentStatus === 'UNPAID') {
        return { allowed: false, reason: 'pending_unpaid' };
    }
    if (order.status === 'COMPLETED') {
        return { allowed: true, reason: 'completed_view' };
    }
    return { allowed: true, reason: 'in_progress' };
}

export function describeFloristDeliveryIncompleteReason(
    order: Pick<Order, 'status' | 'latitude' | 'longitude'>,
    proof: FloristDeliveryProofSnapshot | null | undefined
): string | null {
    if (isFloristDeliveryFullyComplete(order, proof)) return null;
    if (!proof || proof.status !== 'COMPLETED') {
        return 'Mancano foto e conferma di invio.';
    }
    if (countProofPhotos(proof, 'before') < 1 || countProofPhotos(proof, 'after') < 1) {
        return 'Servono almeno una foto Prima e una Dopo.';
    }
    if (!hasSavedGps(order, proof)) {
        return 'Manca la posizione GPS del cimitero.';
    }
    if (order.status !== 'COMPLETED') {
        return 'Conferma di consegna non ancora registrata.';
    }
    return 'Consegna non ancora completata.';
}
