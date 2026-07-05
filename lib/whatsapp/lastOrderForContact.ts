import prisma from '@/lib/prisma';
import type { MessagingContactType } from '@/lib/whatsapp/contactSearch';

/** Ultimo ordine (per data creazione) con codice assegnato, per cliente o fiorista. */
export async function getLastOrderNumberForContact(
    type: MessagingContactType,
    contactId: string
): Promise<string | null> {
    if (!contactId || contactId.startsWith('manual:')) return null;

    const order = await prisma.order.findFirst({
        where: {
            deletedAt: null,
            orderNumber: { not: null },
            ...(type === 'UTENTE' ? { userId: contactId } : { partnerId: contactId }),
        },
        orderBy: { createdAt: 'desc' },
        select: { orderNumber: true },
    });

    return order?.orderNumber?.trim() || null;
}
