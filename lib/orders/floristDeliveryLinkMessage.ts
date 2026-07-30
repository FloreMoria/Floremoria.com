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
import {
    FIRST_OUTBOUND_TITLES,
    withBoldWhatsAppTitle,
} from '@/lib/whatsapp/firstOutboundTitle';

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
    items: Array<
        OrderItemLike & {
            product: OrderLineForListino['product'] & {
                name?: string | null;
                basePriceCents?: number | null;
            };
        }
    >;
    deliveryUrl?: string;
    orderId?: string;
    partnerNotes?: string | null;
}

/** Rimuove il refuso "Gramato" da qualsiasi pezzo di testo outbound. */
export function stripGramatoArtifact(value: string): string {
    return value
        .replace(/\bGramato\b/gi, '')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]+([,.;:!?])/g, '$1')
        .trim();
}

function sanitizeLine(value: string | null | undefined, fallback: string): string {
    const cleaned = stripGramatoArtifact(
        (value || '')
            .replace(/\r\n/g, '\n')
            .replace(/[ \t]+\n/g, '\n')
            .trim()
    );
    return cleaned || fallback;
}

/** Luogo = cimitero + comune (senza coordinate tomba: restano in app / note solo se reali). */
function buildLuogoConsegna(input: FloristNewOrderMessageInput): string {
    const parts = [input.cemeteryName?.trim(), input.cemeteryCity?.trim()]
        .filter(Boolean)
        .map((p) => stripGramatoArtifact(p!));
    return parts.length ? parts.join(', ') : 'Da confermare in app';
}

/**
 * Note di consegna: solo istruzioni vere. Niente coordinate tomba come fallback.
 */
export function sanitizeFloristDeliveryNotes(
    additionalInstructions: string | null | undefined,
    _gravePosition?: string | null
): string {
    const raw = stripGramatoArtifact(stripInternalNotes(additionalInstructions) || '');
    if (!raw) return 'Nessuna nota aggiuntiva';

    const withoutSystemTags = stripGramatoArtifact(
        raw
            .replace(/IMPORT_MANUALE:\s*dashboard\s+admin\s*/gi, '')
            .replace(/IMPORT_MANUALE:[^|]*/gi, '')
            .replace(/Duplicato da [A-Z]{2}-[A-Z]{2}-\d{2}-\d{3}\s*/gi, '')
            .replace(/^\s*\|\s*|\s*\|\s*$/g, '')
            .replace(/\s*\|\s*/g, ' ')
            .replace(/[ \t]{2,}/g, ' ')
            .trim()
    );

    if (
        !withoutSystemTags ||
        /IMPORT_MANUALE|dashboard\s+admin/i.test(withoutSystemTags)
    ) {
        return 'Nessuna nota aggiuntiva';
    }

    return withoutSystemTags;
}

/**
 * Compone il messaggio completo Punto A (prodotto dinamico + link mini-app).
 */
export function buildFloristNewOrderWhatsAppText(input: FloristNewOrderMessageInput): string {
    const floristName = sanitizeLine(input.floristFirstName, 'Partner');
    const orderCode = input.orderCode.trim() || '—';

    let rawCity = (input.city?.trim() || input.cemeteryCity?.trim() || '').trim();
    if (!rawCity || /non specificato/i.test(rawCity)) {
        rawCity = '';
    }
    let rawCemetery = (input.cemeteryName?.trim() || '').trim();
    if (!rawCemetery || /non specificato/i.test(rawCemetery)) {
        rawCemetery = '';
    }

    const city = stripGramatoArtifact(rawCity) || 'zona da confermare';
    let cemetery = stripGramatoArtifact(rawCemetery);
    if (!cemetery && city && city !== 'zona da confermare') {
        cemetery = `Cimitero di ${city}`;
    }
    cemetery = cemetery || 'Cimitero';

    let rawDeceased = (input.deceasedName || '').trim();
    if (!rawDeceased || /non specificato/i.test(rawDeceased)) {
        rawDeceased = '';
    }
    const deceased = sanitizeLine(rawDeceased, 'il caro defunto');

    const luogo = `${cemetery}, ${city}`;
    const prodotto = stripGramatoArtifact(formatFloristOrderProductsLabel(input.items));

    let rawTicket = (input.ticketMessage || '').trim();
    if (!rawTicket || /non specificato/i.test(rawTicket)) {
        rawTicket = '';
    }
    const ticket = sanitizeLine(rawTicket, 'Nessuno');

    const optionals = buildOrderOptionalsList(input.items).map(stripGramatoArtifact);
    const accessori = optionals.length
        ? optionals.join(', ')
        : 'Nessun accessorio extra';

    let rawNote = (input.additionalInstructions || '').trim();
    if (!rawNote || /non specificato/i.test(rawNote)) {
        rawNote = '';
    }
    const note = sanitizeFloristDeliveryNotes(rawNote, input.gravePosition);

    const compensation = calculateFloristCompensation(
        input.items as Parameters<typeof calculateFloristCompensation>[0],
        input.partnerNotes
    );
    const compenso = formatFloristCompensationForTemplate(compensation);

    const deliveryUrl =
        input.deliveryUrl?.trim() ||
        buildFloristDeliveryUrl({
            id: input.orderId || orderCode,
            orderNumber: orderCode,
        });

    const body =
        `Ciao ${floristName}! 🌸\n` +
        `Abbiamo una nuova consegna da affidarti per l'ordine ${orderCode} a ${city} - ${cemetery}.\n` +
        `🕊️ In memoria di: ${deceased}\n` +
        `📍 Luogo: ${luogo}\n` +
        `💐 Prodotto: ${prodotto}\n` +
        `➕ Optional / Accessori: ${accessori}\n` +
        `📝 Testo: ${ticket}\n` +
        `📌 Note di Consegna: ${note}\n` +
        `💶 Compenso per il servizio: ${compenso}\n` +
        `Inviaci fattura che effettuiamo subito il bonifico istantaneo.\n` +
        `Per caricare le foto mentre effettui la consegna dovresti usare il link alla mini-app dedicata a questo ordine:\n` +
        `🔗 ${deliveryUrl}\n\n` +
        `Per qualsiasi dubbio o necessità fammi sapere qui in chat. Mi confermi?\n` +
        `Grazie mille per il tuo supporto!\n` +
        `Vera | Staff FloreMoria 🌹`;

    return withBoldWhatsAppTitle(
        FIRST_OUTBOUND_TITLES.floristNewOrder,
        stripGramatoArtifact(body).replace(/\n{3,}/g, '\n\n')
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
