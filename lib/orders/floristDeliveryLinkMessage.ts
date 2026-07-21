import { buildFloristDeliveryUrl } from '@/lib/orders/resolveOrderIdentifier';
import { formatFloristOrderProductsLabel } from '@/lib/orders/formatFloristProductLabel';
import {
    buildOrderOptionalsList,
    stripInternalNotes,
    type OrderItemLike,
} from '@/lib/orders/orderOptionals';
import {
    calculateFloristCompensation,
    formatFloristCompensationForTemplate,
} from '@/lib/pricing/calculateFloristCompensation';
import type { OrderLineForListino } from '@/lib/pricing/listini';

/**
 * Testo WhatsApp Punto A — nuovo incarico fiorista.
 * Unica rosa 🌹 in chiusura dopo "Vera | Staff FloreMoria".
 */

export const FLORIST_DELIVERY_PHOTO_INSTRUCTION =
    'Scatta le foto ai fiori mentre sei davanti alla tomba o alla bara, poi caricale dalla mini-app.';

export interface FloristNewOrderMessageInput {
    floristFirstName: string;
    orderCode: string;
    city?: string | null;
    deceasedName?: string | null;
    cemeteryName?: string | null;
    cemeteryCity?: string | null;
    gravePosition?: string | null;
    ticketMessage?: string | null;
    additionalInstructions?: string | null;
    items: Array<OrderItemLike & { product: OrderLineForListino['product'] & { name?: string | null } }>;
    deliveryUrl?: string;
    orderId?: string;
}

function sanitizeLine(value: string | null | undefined, fallback: string): string {
    const cleaned = (value || '')
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .trim();
    return cleaned || fallback;
}

function buildLuogoConsegna(input: FloristNewOrderMessageInput): string {
    const parts = [
        input.cemeteryName?.trim(),
        input.cemeteryCity?.trim(),
        input.gravePosition?.trim(),
    ].filter(Boolean);
    return parts.length ? parts.join(', ') : 'Da confermare in app';
}

/**
 * Compone il messaggio completo Punto A (prodotto dinamico + link mini-app).
 */
export function buildFloristNewOrderWhatsAppText(input: FloristNewOrderMessageInput): string {
    const floristName = input.floristFirstName.trim() || 'Partner';
    const orderCode = input.orderCode.trim() || '—';
    const city =
        input.city?.trim() ||
        input.cemeteryCity?.trim() ||
        'zona da confermare';
    const deceased = sanitizeLine(input.deceasedName, 'il caro defunto');
    const luogo = buildLuogoConsegna(input);
    const prodotto = formatFloristOrderProductsLabel(input.items);
    const ticket = sanitizeLine(input.ticketMessage, 'Nessuno');
    const optionals = buildOrderOptionalsList(input.items);
    const accessori = optionals.length
        ? optionals.join(', ')
        : 'Nessun accessorio extra';
    const note = sanitizeLine(stripInternalNotes(input.additionalInstructions), 'Nessuna nota aggiuntiva');

    const compensation = calculateFloristCompensation(input.items as OrderLineForListino[]);
    const compenso = formatFloristCompensationForTemplate(compensation);

    const deliveryUrl =
        input.deliveryUrl?.trim() ||
        buildFloristDeliveryUrl({
            id: input.orderId || orderCode,
            orderNumber: orderCode,
        });

    return (
        `Ciao ${floristName}! 🌸\n` +
        `Abbiamo una nuova consegna da affidarti per l'ordine ${orderCode} a ${city}.\n\n` +
        `🕊️ In memoria di: ${deceased}\n` +
        `📍 Luogo: ${luogo}\n` +
        `💐 Prodotto: ${prodotto}\n` +
        `📝 Testo Biglietto: ${ticket}\n` +
        `➕ Optional / Accessori: ${accessori}\n` +
        `📌 Note di Consegna: ${note}\n` +
        `💶 Compenso per il servizio: ${compenso}\n\n` +
        `Per caricare la foto a consegna effettuata puoi usare il link alla mini-app dedicata a questo ordine:\n` +
        `🔗 ${deliveryUrl}\n\n` +
        `Per qualsiasi dubbio o necessità fammi sapere qui in chat. Grazie mille per il tuo supporto!\n` +
        `Vera | Staff FloreMoria 🌹`
    );
}

/** @deprecated Usare buildFloristNewOrderWhatsAppText — mantenuto per compatibilità import legacy. */
export interface FloristDeliveryMessageInput {
    codice_ordine?: string | null;
    nome_defunto?: string | null;
    cimitero?: string | null;
    comune_cimitero?: string | null;
    posizione_tomba?: string | null;
    data_consegna?: string | null;
    deliveryUrl: string;
}

/** @deprecated */
export function buildFloristDeliveryWhatsAppText(input: FloristDeliveryMessageInput): string {
    return buildFloristNewOrderWhatsAppText({
        floristFirstName: 'Partner',
        orderCode: input.codice_ordine || '—',
        city: input.comune_cimitero,
        deceasedName: input.nome_defunto,
        cemeteryName: input.cimitero,
        cemeteryCity: input.comune_cimitero,
        gravePosition: input.posizione_tomba,
        items: [],
        deliveryUrl: input.deliveryUrl,
    });
}
