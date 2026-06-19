/**
 * Unico percorso autorizzato di creazione/upsert contatto cliente Futuria:
 * subito dopo pagamento Stripe confermato e allineamento DB locale.
 */
import prisma from '@/lib/prisma';
import { getFuturiaClientePaganteTag } from './config';
import {
    isFuturiaConfigured,
    normalizeFuturiaPhone,
    upsertFuturiaContact,
} from './client';

export interface SyncPaidCustomerResult {
    ok: boolean;
    contactId?: string;
    skipped?: string;
}

function formatItalianDate(value: Date | null | undefined): string | undefined {
    if (!value) return undefined;
    return value.toLocaleDateString('it-IT');
}

export async function syncPaidCustomerToFuturia(orderId: string): Promise<SyncPaidCustomerResult> {
    if (!isFuturiaConfigured()) {
        return { ok: false, skipped: 'futuria_not_configured' };
    }

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.deletedAt || order.partnerPaymentStatus !== 'PAID') {
        return { ok: false, skipped: 'order_not_paid' };
    }

    const phone = normalizeFuturiaPhone(order.customerPhone);
    if (!phone) {
        console.warn(
            `[futuria-paid-sync] Telefono assente/non valido per ordine ${order.orderNumber || orderId}.`
        );
        return { ok: false, skipped: 'invalid_phone' };
    }

    const pastOrdersCount = await prisma.order.count({
        where: {
            id: { not: orderId },
            partnerPaymentStatus: 'PAID',
            deletedAt: null,
            OR: [
                ...(order.buyerEmail ? [{ buyerEmail: order.buyerEmail }] : []),
                ...(order.customerPhone ? [{ customerPhone: order.customerPhone }] : []),
            ],
        },
    });
    const isHistorical = pastOrdersCount > 0;

    const tags = [
        getFuturiaClientePaganteTag(),
        'floremoria-nuovo-ordine',
        isHistorical ? 'utente-storico' : 'Nuovo-Utente',
    ];

    const additionalCustomFields: Record<string, string> = {
        'contact.nome_defunto': order.deceasedName,
        'contact.comune_cimitero': order.cemeteryCity,
        'contact.cimitero': order.cemeteryName,
    };

    if (order.orderNumber) {
        additionalCustomFields['contact.codice_ordine'] = order.orderNumber;
    }
    if (order.gravePosition) {
        additionalCustomFields['contact.posizione_tomba'] = order.gravePosition;
    }
    const deathDate = formatItalianDate(order.deceasedDeathDate);
    if (deathDate) {
        additionalCustomFields['contact.data_decesso'] = deathDate;
    }
    const deliveryDate = formatItalianDate(order.deliveryDate);
    if (deliveryDate) {
        additionalCustomFields['contact.data_consegna'] = deliveryDate;
    }
    if (order.additionalInstructions) {
        additionalCustomFields['contact.note_logistiche'] = order.additionalInstructions;
    }
    if (order.buyerCity) {
        additionalCustomFields['contact.comune_acquirente'] = order.buyerCity;
    }
    if (order.buyerFullName) {
        additionalCustomFields['contact.nome_acquirente'] = order.buyerFullName;
    }

    const contactId = await upsertFuturiaContact(
        {
            phone,
            email: order.buyerEmail || undefined,
            name: order.buyerFullName || undefined,
            deceasedName: order.deceasedName,
            orderNumber: order.orderNumber,
            tags,
            additionalCustomFields,
        },
        { source: 'paid_order', orderId }
    );

    console.info(
        `[futuria-paid-sync] Contatto cliente sincronizzato order=${order.orderNumber || orderId} contactId=${contactId} tags=${tags.join(',')}`
    );

    return { ok: true, contactId };
}
