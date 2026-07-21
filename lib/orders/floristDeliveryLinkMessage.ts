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

/** Rimuove il refuso "Gramato" da qualsiasi pezzo di testo outbound. */
export function stripGramatoArtifact(value: string): string {
    return value
        .replace(/\bGramato\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+([,.;:!?])/g, '$1')
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

function buildLuogoConsegna(input: FloristNewOrderMessageInput): string {
    const parts = [
        input.cemeteryName?.trim(),
        input.cemeteryCity?.trim(),
        input.gravePosition?.trim(),
    ]
        .filter(Boolean)
        .map((p) => stripGramatoArtifact(p!));
    return parts.length ? parts.join(', ') : 'Da confermare in app';
}

/**
 * Note di consegna per il fiorista: niente tag di import dashboard.
 * Se restano solo refusi di sistema → coordinate tomba, altrimenti "Nessuna nota aggiuntiva".
 */
export function sanitizeFloristDeliveryNotes(
    additionalInstructions: string | null | undefined,
    gravePosition?: string | null
): string {
    const raw = stripGramatoArtifact(stripInternalNotes(additionalInstructions) || '');
    if (!raw) {
        return gravePosition?.trim()
            ? stripGramatoArtifact(gravePosition)
            : 'Nessuna nota aggiuntiva';
    }

    const withoutSystemTags = stripGramatoArtifact(
        raw
            .replace(/IMPORT_MANUALE:\s*dashboard\s+admin\s*/gi, '')
            .replace(/IMPORT_MANUALE:[^|]*/gi, '')
            .replace(/Duplicato da [A-Z]{2}-[A-Z]{2}-\d{2}-\d{3}\s*/gi, '')
            .replace(/^\s*\|\s*|\s*\|\s*$/g, '')
            .replace(/\s*\|\s*/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim()
    );

    const stillSystemJunk =
        !withoutSystemTags ||
        /IMPORT_MANUALE|dashboard\s+admin/i.test(withoutSystemTags);

    if (stillSystemJunk) {
        const coords = gravePosition?.trim();
        return coords ? stripGramatoArtifact(coords) : 'Nessuna nota aggiuntiva';
    }

    return withoutSystemTags;
}

/**
 * Compone il messaggio completo Punto A (prodotto dinamico + link mini-app).
 */
export function buildFloristNewOrderWhatsAppText(input: FloristNewOrderMessageInput): string {
    const floristName = sanitizeLine(input.floristFirstName, 'Partner');
    const orderCode = input.orderCode.trim() || '—';
    const city = sanitizeLine(
        input.city?.trim() || input.cemeteryCity?.trim() || '',
        'zona da confermare'
    );
    const deceased = sanitizeLine(input.deceasedName, 'il caro defunto');
    const luogo = buildLuogoConsegna(input);
    const prodotto = stripGramatoArtifact(formatFloristOrderProductsLabel(input.items));
    const ticket = sanitizeLine(input.ticketMessage, 'Nessuno');
    const optionals = buildOrderOptionalsList(input.items).map(stripGramatoArtifact);
    const accessori = optionals.length
        ? optionals.join(', ')
        : 'Nessun accessorio extra';
    const note = sanitizeFloristDeliveryNotes(
        input.additionalInstructions,
        input.gravePosition
    );

    const compensation = calculateFloristCompensation(input.items as OrderLineForListino[]);
    const compenso = formatFloristCompensationForTemplate(compensation);

    const deliveryUrl =
        input.deliveryUrl?.trim() ||
        buildFloristDeliveryUrl({
            id: input.orderId || orderCode,
            orderNumber: orderCode,
        });

    const body =
        `Ciao ${floristName}! 🌸\n` +
        `Abbiamo una nuova consegna da affidarti per l'ordine ${orderCode} a ${city}.\n\n` +
        `🕊️ In memoria di: ${deceased}\n` +
        `📍 Luogo: ${luogo}\n` +
        `💐 Prodotto: ${prodotto}\n` +
        `📝 Testo: ${ticket}\n` +
        `➕ Optional / Accessori: ${accessori}\n` +
        `📌 Note di Consegna: ${note}\n` +
        `💶 Compenso per il servizio: ${compenso}\n\n` +
        `Per caricare le foto mentre effettui la consegna puoi usare il link alla mini-app dedicata a questo ordine:\n` +
        `🔗 ${deliveryUrl}\n\n` +
        `Per qualsiasi dubbio o necessità fammi sapere qui in chat. Grazie mille per il tuo supporto!\n` +
        `Vera | Staff FloreMoria 🌹`;

    return stripGramatoArtifact(body).replace(/\n{3,}/g, '\n\n');
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
