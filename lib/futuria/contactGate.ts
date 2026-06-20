/**
 * Gate di creazione contatti Futuria: un nuovo contatto cliente può nascere
 * solo dal webhook Stripe post-pagamento. Aggiornamenti su contatti già presenti
 * restano consentiti per auth, consegna e partner B2B.
 */
import prisma from '@/lib/prisma';
import { findFuturiaDuplicateContact, type FuturiaContactRecord } from './client';

export class FuturiaContactGateError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'FuturiaContactGateError';
    }
}

export type FuturiaContactAuth =
    | { source: 'paid_order'; orderId: string }
    | { source: 'partner_florist' }
    | { source: 'paid_order_followup'; orderId: string }
    | { source: 'existing_contact_update' };

async function assertPaidOrder(orderId: string): Promise<void> {
    const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { partnerPaymentStatus: true, deletedAt: true },
    });
    if (!order || order.deletedAt || order.partnerPaymentStatus !== 'PAID') {
        throw new FuturiaContactGateError(
            'Contatto Futuria cliente consentito solo con ordine pagato verificato.'
        );
    }
}

/**
 * Blocca la creazione di contatti non autorizzati; consente aggiornamenti su contatti esistenti.
 */
export async function assertFuturiaContactAllowed(
    auth: FuturiaContactAuth,
    existingContact: FuturiaContactRecord | null
): Promise<void> {
    if (existingContact?.id) {
        if (auth.source === 'paid_order_followup') {
            await assertPaidOrder(auth.orderId);
        }
        return;
    }

    switch (auth.source) {
        case 'paid_order':
            await assertPaidOrder(auth.orderId);
            return;
        case 'partner_florist':
            return;
        case 'paid_order_followup':
            throw new FuturiaContactGateError(
                'Follow-up ordine pagato senza contatto Futuria esistente: eseguire sync post-Stripe.'
            );
        case 'existing_contact_update':
            throw new FuturiaContactGateError(
                'Aggiornamento Futuria senza contatto esistente: ingresso cliente solo post-pagamento.'
            );
        default:
            throw new FuturiaContactGateError('Creazione contatto Futuria non autorizzata.');
    }
}

/**
 * Auth per follow-up post-consegna: aggiorna contatto esistente (paid_order_followup)
 * oppure crea da ordine pagato se mancante (paid_order).
 * Chiave canonica: email utente (Caso B).
 */
export async function resolveDeliveryFollowupContactAuth(params: {
    orderId: string;
    email: string;
}): Promise<FuturiaContactAuth> {
    const existing = await findFuturiaDuplicateContact({
        email: params.email,
    });

    if (existing?.id) {
        return { source: 'paid_order_followup', orderId: params.orderId };
    }

    return { source: 'paid_order', orderId: params.orderId };
}
