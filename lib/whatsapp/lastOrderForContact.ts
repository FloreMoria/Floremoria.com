import prisma from '@/lib/prisma';
import { buildProofFotoAccessUrl } from '@/lib/auth/proofFotoAccess';
import { buildFloristDeliveryUrl } from '@/lib/orders/resolveOrderIdentifier';
import { hasLuminoOption, orderHasBigliettinoOrRibbon } from '@/lib/orders/orderOptionals';
import {
    calculateFloristCompensation,
    formatFloristCompensationForTemplate,
} from '@/lib/pricing/calculateFloristCompensation';
import type { MessagingContactType } from '@/lib/whatsapp/contactSearch';
import { extractFirstName } from '@/lib/whatsapp/proactiveTemplateParams';

/** Contesto ordine per auto-mapping {{1}}, {{2}}… nei template Meta (Scenario A). */
export interface OrderTemplateSeed {
    orderNumber: string | null;
    orderCode: string | null;
    deceasedName: string | null;
    cemeteryName: string | null;
    cemeteryCity: string | null;
    cemeteryLabel: string | null;
    gravePosition: string | null;
    ticketMessage: string | null;
    ticketText: string | null;
    buyerFirstName: string | null;
    userFirstName: string | null;
    floristFirstName: string | null;
    deliveryUrl: string | null;
    magicLink: string | null;
    floristPrice: string | null;
    partnerCity: string | null;
    luminoYesNo: string;
    ticketYesNo: string;
    catalogUrl: string;
    rememberedPerson: string | null;
}

/** Ultimo ordine (per data creazione) con codice assegnato, per cliente o fiorista. */
export async function getLastOrderNumberForContact(
    type: MessagingContactType,
    contactId: string
): Promise<string | null> {
    const seed = await getLastOrderTemplateSeedForContact(type, contactId);
    return seed?.orderNumber ?? null;
}

export async function getLastOrderTemplateSeedForContact(
    type: MessagingContactType,
    contactId: string
): Promise<OrderTemplateSeed | null> {
    if (!contactId || contactId.startsWith('manual:')) return null;

    const order = await prisma.order.findFirst({
        where: {
            deletedAt: null,
            orderNumber: { not: null },
            ...(type === 'UTENTE' ? { userId: contactId } : { partnerId: contactId }),
        },
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            orderNumber: true,
            deceasedName: true,
            cemeteryName: true,
            cemeteryCity: true,
            gravePosition: true,
            ticketMessage: true,
            buyerFullName: true,
            items: {
                select: {
                    id: true,
                    productId: true,
                    quantity: true,
                    priceCents: true,
                    product: { select: { id: true, name: true, slug: true, isBouquet: true } },
                },
            },
            partner: {
                select: {
                    ownerName: true,
                    shopName: true,
                    coverageArea: true,
                    internalNotes: true,
                },
            },
            user: { select: { name: true } },
        },
    });

    if (!order) return null;

    const cemeteryLabel = [order.cemeteryName, order.cemeteryCity].filter(Boolean).join(', ') || null;
    const buyerFull = order.buyerFullName || order.user?.name || null;
    const buyerFirst = extractFirstName(buyerFull || '') || null;
    const floristFull = order.partner?.ownerName || order.partner?.shopName || null;
    const floristFirst = extractFirstName(floristFull || '') || null;
    const compensation = formatFloristCompensationForTemplate(
        calculateFloristCompensation(order.items, order.partner?.internalNotes)
    );
    const lumino = hasLuminoOption(order.items);
    const ticket = orderHasBigliettinoOrRibbon(order.items, order.ticketMessage);
    const ticketText = order.ticketMessage?.trim() || 'Nessuno';

    let magicLink: string | null = null;
    try {
        magicLink = await buildProofFotoAccessUrl(order.id, order.orderNumber);
    } catch {
        magicLink = null;
    }

    return {
        orderNumber: order.orderNumber?.trim() || null,
        orderCode: order.orderNumber?.trim() || null,
        deceasedName: order.deceasedName?.trim() || null,
        cemeteryName: order.cemeteryName?.trim() || null,
        cemeteryCity: order.cemeteryCity?.trim() || null,
        cemeteryLabel,
        gravePosition: order.gravePosition?.trim() || null,
        ticketMessage: order.ticketMessage?.trim() || null,
        ticketText,
        buyerFirstName: buyerFirst,
        userFirstName: buyerFirst,
        floristFirstName: floristFirst,
        deliveryUrl: buildFloristDeliveryUrl({ id: order.id, orderNumber: order.orderNumber }),
        magicLink,
        floristPrice: compensation,
        partnerCity: order.cemeteryCity?.trim() || order.partner?.coverageArea?.trim() || null,
        luminoYesNo: lumino ? 'Sì' : 'No',
        ticketYesNo: ticket ? 'Sì' : 'No',
        catalogUrl: 'https://www.floremoria.com/fiori-sulle-tombe',
        rememberedPerson: order.deceasedName?.trim() || null,
    };
}
