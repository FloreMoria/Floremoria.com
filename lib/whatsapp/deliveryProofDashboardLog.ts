import { addMessage, updateSessionProfile } from '@/lib/chatStore';
import { normalizePhoneE164 } from '@/lib/whatsapp/metaCloudApiClient';

export interface DeliveryProofDashboardLogInput {
    orderId: string;
    orderNumber?: string | null;
    buyerFullName?: string | null;
}

function toWhatsAppSessionPhone(phoneE164: string): string {
    const e164 = normalizePhoneE164(phoneE164);
    if (!e164) throw new Error('invalid_phone');
    return `whatsapp:${e164}`;
}

/** Registra l'invio post-consegna nella inbox dashboard Messaggi. */
export async function logProofToDashboard(
    phoneE164: string,
    buyerName: string,
    message: string,
    order: DeliveryProofDashboardLogInput
): Promise<void> {
    try {
        const address = toWhatsAppSessionPhone(phoneE164);
        await addMessage(address, 'OUTBOUND', message, undefined, {
            eventType: 'PROOF_OF_DELIVERY',
            orderId: order.orderId,
            ...(order.orderNumber ? { orderNumber: order.orderNumber } : {}),
            outboundMode: 'delivery_proof',
        });
        await updateSessionProfile(address, {
            userType: 'UTENTE',
            ...(buyerName ? { name: buyerName } : {}),
        });
    } catch (e) {
        console.warn('[delivery-proof-dashboard] Registrazione non riuscita (non bloccante):', e);
    }
}
