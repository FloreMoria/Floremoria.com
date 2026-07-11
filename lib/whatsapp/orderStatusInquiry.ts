import prisma from '@/lib/prisma';
import { sanitizeWhatsAppDisplayName } from '@/lib/vera/displayName';
import { isPreAcquisitionIntent } from '@/lib/vera/preAcquisitionIntent';
import { extractFirstName } from '@/lib/whatsapp/proactiveTemplateParams';
import { normalizePhoneE164 } from '@/lib/whatsapp/metaCloudApiClient';
import type { DeliveryProof, Order, OrderStatus } from '@prisma/client';

const VERA_ACTIVE_ORDER_STATUSES: OrderStatus[] = ['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'DELIVERING'];

/** Codice ordine esplicito (FT/FF/PA/FM-XX-26-NNN). */
const ORDER_CODE_PATTERN = /\b(?:FT|FF|PA|FM)-[A-Z]{2}-\d{2}-\d{3,4}\b/i;

const EXPLICIT_ORDER_STATUS_PHRASES = [
    'dove e il mio ordine',
    'stato del mio ordine',
    'stato ordine',
    'aggiornamento ordine',
    'aggiornamento sul mio ordine',
    'tracciare ordine',
    'tracking ordine',
    'seguire ordine',
    'notizie ordine',
    'notizie sul mio ordine',
    'notizie sulla consegna',
    'informazioni sul mio ordine',
];

const HYPOTHETICAL_MARKERS = [
    'cosa succede se',
    'cosa fare se',
    'e se il cimitero',
    'se il cimitero e chiuso',
    'se il cimitero fosse chiuso',
    'se e chiuso',
    'in caso il cimitero',
    'potete consegnare se',
    'consegnate se',
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

function hasAny(haystack: string, needles: string[]): boolean {
    return needles.some((needle) => haystack.includes(needle));
}

export function extractOrderCodeFromMessage(message: string): string | null {
    const match = message.match(ORDER_CODE_PATTERN);
    return match?.[0]?.toUpperCase() ?? null;
}

function isHypotheticalOrderQuestion(message: string): boolean {
    const m = normalizeForMatch(message);
    if (!m) return false;
    if (HYPOTHETICAL_MARKERS.some((marker) => m.includes(marker))) return true;
    if (m.startsWith('se ') && !m.includes('mio ordine') && !m.includes('ordine ')) return true;
    return false;
}

function isExplicitPersonalOrderStatusRequest(message: string): boolean {
    const m = normalizeForMatch(message);
    if (!m) return false;

    if (EXPLICIT_ORDER_STATUS_PHRASES.some((phrase) => m.includes(phrase))) return true;

    if (m.includes('mio ordine') && hasAny(m, ['stato', 'dove', 'quando', 'aggiorn', 'notizie', 'foto'])) {
        return true;
    }

    if (
        hasAny(m, [
            'non ho ricevuto la foto',
            'non ho ricevuto foto',
            'foto non arrivata',
            'foto non ricevuta',
            'foto di consegna',
        ]) &&
        hasAny(m, ['ordine', 'minuti fa', 'ore fa', 'stamattina', 'fiori', 'funerale', 'consegna'])
    ) {
        return true;
    }

    if (
        m.includes('funerale') &&
        hasAny(m, ['arrivati', 'arrivato', 'foto', 'ordine', 'minuti fa', 'un ora', 'tra un ora'])
    ) {
        return true;
    }

    if (/\b(fatto|effettuato|piazzato)\s+(un\s+)?ordine\b/.test(m) && hasAny(m, ['minuti fa', 'ore fa', 'stamattina', 'foto', 'nastro', 'modific'])) {
        return true;
    }

    return false;
}

/**
 * True solo se l'utente chiede lo stato del PROPRIO ordine (codice esplicito o frase diretta),
 * non per domande ipotetiche o generiche sul servizio.
 */
export function isOrderTrackingInquiry(message: string): boolean {
    if (isPreAcquisitionIntent(message)) return false;

    const m = normalizeForMatch(message);
    if (!m) return false;
    if (isHypotheticalOrderQuestion(message)) return false;

    if (extractOrderCodeFromMessage(message)) return true;

    return isExplicitPersonalOrderStatusRequest(message);
}

export function isOrderOpenForVeraContext(
    order: Pick<Order, 'status'> & { deliveryProof?: Pick<DeliveryProof, 'status'> | null }
): boolean {
    if (order.status === 'CANCELLED' || order.status === 'COMPLETED') return false;
    if (order.deliveryProof?.status === 'COMPLETED') return false;
    return VERA_ACTIVE_ORDER_STATUSES.includes(order.status);
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

export async function lookupOrderByNumber(orderNumber: string): Promise<OrderWithProof | null> {
    return prisma.order.findFirst({
        where: {
            deletedAt: null,
            orderNumber: { equals: orderNumber, mode: 'insensitive' },
        },
        include: { deliveryProof: true },
    });
}

/** Ultimo ordine ancora aperto (non completato/cancellato) per contesto VERA. */
export async function lookupActiveOrderByPhone(phoneE164: string): Promise<OrderWithProof | null> {
    const order = await lookupLastOrderByPhone(phoneE164);
    if (!order || !isOrderOpenForVeraContext(order)) return null;
    return order;
}

function salutationPrefix(displayName: string): string {
    const sanitized = sanitizeWhatsAppDisplayName(displayName);
    if (!sanitized) return '';
    const firstName = extractFirstName(sanitized);
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

function buildNoOrderFoundReply(displayName: string, orderCode?: string | null): string {
    const prefix = salutationPrefix(displayName);
    if (orderCode) {
        return (
            `${prefix}La ringrazio per averci scritto. Non trovo al momento l'ordine ${orderCode}: ` +
            `verifico subito con lo Staff e La ricontatto qui con un aggiornamento preciso.`
        );
    }
    return (
        `${prefix}La ringrazio per averci scritto. Al momento non trovo un ordine recente associato al Suo numero: ` +
        `se ha già effettuato un ordine, mi indichi gentilmente il codice (es. FF-PN-26-004) così posso verificare subito lo stato e l'eventuale foto di consegna.`
    );
}

/**
 * Lookup DB solo con codice ordine esplicito o richiesta diretta sul proprio ordine.
 */
export async function tryBuildOrderTrackingReply(
    sessionPhone: string,
    displayName: string,
    message: string
): Promise<string | null> {
    if (isPreAcquisitionIntent(message) || !isOrderTrackingInquiry(message)) return null;

    const orderCode = extractOrderCodeFromMessage(message);
    if (orderCode) {
        const order = await lookupOrderByNumber(orderCode);
        if (!order) return buildNoOrderFoundReply(displayName, orderCode);
        return buildOrderStatusEmpatheticReply(order, displayName);
    }

    if (!isExplicitPersonalOrderStatusRequest(message)) return null;

    const e164 = normalizePhoneE164(sessionPhone.replace(/^whatsapp:/i, ''));
    if (!e164) return buildNoOrderFoundReply(displayName);

    const order = await lookupLastOrderByPhone(e164);
    if (!order) return buildNoOrderFoundReply(displayName);

    return buildOrderStatusEmpatheticReply(order, displayName);
}
