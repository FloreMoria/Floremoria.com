import prisma from '@/lib/prisma';
import { extractFirstName } from '@/lib/whatsapp/proactiveTemplateParams';
import { normalizePhoneE164 } from '@/lib/whatsapp/metaCloudApiClient';
import type { DeliveryProof, Order, OrderStatus } from '@prisma/client';

const ORDER_TRACKING_KEYWORDS = [
    'foto',
    'consegna',
    'ordine',
    'immagine',
    'bouquet',
    'aggiornament',
    'stato',
    'consegnat',
    'posa',
    'prova',
    'dove',
    'quando',
    'arriv',
    'spediz',
    'tracking',
];

function normalizeForMatch(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Messaggio utente che chiede aggiornamenti, foto o stato di un ordine esistente. */
export function isOrderTrackingInquiry(message: string): boolean {
    const m = normalizeForMatch(message);
    if (!m) return false;
    return ORDER_TRACKING_KEYWORDS.some((keyword) => m.includes(keyword));
}

function phoneLookupVariants(phoneE164: string): string[] {
    const normalized = normalizePhoneE164(phoneE164);
    if (!normalized) return [];

    const digits = normalized.replace(/\D/g, '');
    const variants = new Set<string>([normalized, digits, `+${digits}`]);

    if (digits.startsWith('39') && digits.length >= 11) {
        const local = digits.slice(2);
        variants.add(local);
        variants.add(`+39${local}`);
        variants.add(`39${local}`);
    }

    return [...variants].filter(Boolean);
}

type OrderWithProof = Order & { deliveryProof: DeliveryProof | null };

export async function lookupLastOrderByPhone(phoneE164: string): Promise<OrderWithProof | null> {
    const variants = phoneLookupVariants(phoneE164);
    if (variants.length === 0) return null;

    const byPhone = await prisma.order.findFirst({
        where: {
            deletedAt: null,
            customerPhone: { in: variants },
        },
        orderBy: { createdAt: 'desc' },
        include: { deliveryProof: true },
    });
    if (byPhone) return byPhone;

    const user = await prisma.user.findFirst({
        where: {
            deletedAt: null,
            OR: variants.map((phone) => ({ phone: { contains: phone.replace(/^\+/, '') } })),
        },
        select: { id: true },
    });
    if (!user) return null;

    return prisma.order.findFirst({
        where: { deletedAt: null, userId: user.id },
        orderBy: { createdAt: 'desc' },
        include: { deliveryProof: true },
    });
}

function salutationPrefix(displayName: string): string {
    const firstName = extractFirstName(displayName);
    return firstName ? `Gentile ${firstName}, ` : '';
}

function hasDeliveryPhoto(proof: DeliveryProof | null | undefined): boolean {
    if (!proof || proof.status !== 'COMPLETED') return false;
    return Boolean(proof.photoAfterUrl || proof.photosAfterUrls?.length);
}

function describeOrderStatus(
    status: OrderStatus,
    proof: DeliveryProof | null | undefined,
    deceasedName: string,
    orderNumber: string | null
): string {
    const ref = orderNumber ? ` (riferimento ${orderNumber})` : '';
    const dear = deceasedName.trim() || 'chi ama';

    if (hasDeliveryPhoto(proof)) {
        return `per l'omaggio dedicato a ${dear}${ref}, il nostro partner ha già effettuato la posa con cura. Le abbiamo inviato — o Le invieremo a breve — la testimonianza fotografica su WhatsApp, perché possa sentirsi vicina a questo gesto di ricordo.`;
    }

    if (status === 'COMPLETED' || proof?.status === 'COMPLETED') {
        return `per l'omaggio a ${dear}${ref}, la consegna risulta completata. Se non ha ancora ricevuto la foto, me ne occupo subito personalmente e La aggiorno qui in chat.`;
    }

    if (status === 'DELIVERING' || status === 'IN_PROGRESS') {
        return `per l'omaggio a ${dear}${ref}, stiamo preparando i fiori con la massima cura: il nostro partner locale è già al lavoro e La terrò aggiornata passo dopo passo.`;
    }

    if (status === 'ACCEPTED') {
        return `per l'omaggio a ${dear}${ref}, l'ordine è confermato e in organizzazione presso il fiorista partner della zona. Appena la posa sarà eseguita, Le invieremo la testimonianza fotografica.`;
    }

    if (status === 'CANCELLED') {
        return `non risulta un ordine attivo${ref} associato al Suo numero. Se crede si tratti di un errore, mi indichi pure il codice ordine e verifico subito con lo Staff.`;
    }

    return `per l'omaggio a ${dear}${ref}, l'ordine è registrato e in avvio. La terrò informata con la stessa cura con cui seguiamo ogni famiglia, fino all'invio della foto prova.`;
}

/** Risposta empatica sullo stato ordine — stile chat storiche, senza link commerciali. */
export function buildOrderStatusEmpatheticReply(order: OrderWithProof, displayName: string): string {
    const prefix = salutationPrefix(displayName);
    const body = describeOrderStatus(
        order.status,
        order.deliveryProof,
        order.deceasedName,
        order.orderNumber
    );
    return `${prefix}La ringrazio per averci scritto. ${body.charAt(0).toUpperCase()}${body.slice(1)}`;
}

function buildNoOrderFoundReply(displayName: string): string {
    const prefix = salutationPrefix(displayName);
    return (
        `${prefix}La ringrazio per averci scritto. Al momento non trovo un ordine recente associato al Suo numero: ` +
        `se ha già effettuato un ordine, mi indichi gentilmente il codice (es. FF-PN-26-004) così posso verificare subito lo stato e l'eventuale foto di consegna.`
    );
}

/**
 * Se il messaggio riguarda ordine/foto/consegna, risponde con stato DB reale
 * (o richiesta codice ordine) senza link al catalogo.
 */
export async function tryBuildOrderTrackingReply(
    sessionPhone: string,
    displayName: string,
    message: string
): Promise<string | null> {
    if (!isOrderTrackingInquiry(message)) return null;

    const e164 = normalizePhoneE164(sessionPhone.replace(/^whatsapp:/i, ''));
    if (!e164) return buildNoOrderFoundReply(displayName);

    const order = await lookupLastOrderByPhone(e164);
    if (!order) return buildNoOrderFoundReply(displayName);

    return buildOrderStatusEmpatheticReply(order, displayName);
}
