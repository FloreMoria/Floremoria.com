/**
 * Parametri body per Meta `floremoria_nuovo_ordine_fiorista` (11 variabili, solo body).
 * Ordine tassativo allineato al template APPROVED sul WABA FloreMoria.
 */

import { buildFloristDeliveryUrl } from '@/lib/orders/resolveOrderIdentifier';
import { resolveFloristDeliveryDeadline } from '@/lib/orders/formatFloristDeliveryDeadline';
import { formatFloristOrderProductsLabel } from '@/lib/orders/formatFloristProductLabel';
import {
    buildOrderOptionalsList,
    hasPhotoBeforeOption,
    type OrderItemLike,
} from '@/lib/orders/orderOptionals';
import {
    calculateFloristCompensation,
    formatFloristCompensationForTemplate,
} from '@/lib/pricing/calculateFloristCompensation';
import type { OrderLineForListino } from '@/lib/pricing/listini';
import { extractFirstName } from '@/lib/whatsapp/proactiveTemplateParams';
import { metaParamOrDash } from '@/lib/whatsapp/floristTemplateCopy';
import { META_TEMPLATE_LIMITS } from '@/lib/whatsapp/metaTemplateLimits';

export const FLORIST_NUOVO_ORDINE_BODY_PARAM_COUNT = 11;

export type FloristNuovoOrdineItem = OrderItemLike & {
    product: OrderLineForListino['product'] & {
        name?: string | null;
        basePriceCents?: number | null;
    };
};

export interface FloristNuovoOrdineInput {
    floristFirstName?: string | null;
    orderCode?: string | null;
    deceasedName?: string | null;
    cemeteryName?: string | null;
    cemeteryCity?: string | null;
    province?: string | null;
    ticketMessage?: string | null;
    items: FloristNuovoOrdineItem[];
    partnerNotes?: string | null;
    deliveryDate?: Date | string | null;
    requestedDeliveryDate?: Date | string | null;
    createdAt?: Date | string | null;
    orderId?: string | null;
    deliveryUrl?: string | null;
}

function stripNoise(value: string | null | undefined): string {
    return String(value ?? '')
        .replace(/\bGramato\b/gi, '')
        .replace(/\r\n/g, ' ')
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

/** {{5}} Comune — es. «Pordenone (PN)». */
export function formatFloristComuneParam(input: {
    city?: string | null;
    province?: string | null;
}): string {
    let city = stripNoise(input.city);
    if (!city || /non specificato/i.test(city)) city = '';
    let province = stripNoise(input.province).replace(/[()]/g, '');
    if (!province || /non specificato/i.test(province)) province = '';

    if (city && province) return `${city} (${province.toUpperCase()})`;
    if (city) return city;
    return '-';
}

/** {{6}} Luogo — es. «Casa Funeraria San Marco» / nome cimitero. */
export function formatFloristLuogoParam(input: {
    cemeteryName?: string | null;
    cemeteryCity?: string | null;
}): string {
    let cemetery = stripNoise(input.cemeteryName);
    if (!cemetery || /non specificato/i.test(cemetery)) cemetery = '';
    if (cemetery) return cemetery;

    const city = stripNoise(input.cemeteryCity);
    if (city && !/non specificato/i.test(city)) {
        return `Cimitero Comunale di ${city}`;
    }
    return '-';
}

/** {{8}} Accessori. */
export function formatFloristAccessoriParam(items: OrderItemLike[]): string {
    const optionals = buildOrderOptionalsList(items).map(stripNoise).filter(Boolean);
    if (hasPhotoBeforeOption(items)) {
        optionals.unshift('Foto stato di fatto prima della consegna');
    }
    if (!optionals.length) return 'Nessun accessorio extra';
    return optionals.join(', ');
}

/**
 * Costruisce ESATTAMENTE 11 parametri body per `floremoria_nuovo_ordine_fiorista`.
 * Ogni slot vuoto → '-'.
 */
export function buildFloristNuovoOrdineBodyParams(input: FloristNuovoOrdineInput): string[] {
    const floristName = metaParamOrDash(
        extractFirstName(input.floristFirstName || '') || input.floristFirstName || 'Fiorista',
        META_TEMPLATE_LIMITS.shortName
    );
    const orderCode = metaParamOrDash(
        stripNoise(input.orderCode) || '-',
        META_TEMPLATE_LIMITS.orderCode
    );
    const deceased = metaParamOrDash(
        stripNoise(input.deceasedName).replace(/^per\s+/i, '') || 'il caro defunto',
        META_TEMPLATE_LIMITS.deceasedName
    );

    const deadline = resolveFloristDeliveryDeadline({
        deliveryDate: input.deliveryDate,
        requestedDeliveryDate: input.requestedDeliveryDate,
        createdAt: input.createdAt,
    });
    const deliveryWhen = metaParamOrDash(deadline.label, 120);

    const comune = metaParamOrDash(
        formatFloristComuneParam({
            city: input.cemeteryCity,
            province: input.province,
        }),
        META_TEMPLATE_LIMITS.locationLabel
    );
    const luogo = metaParamOrDash(
        formatFloristLuogoParam({
            cemeteryName: input.cemeteryName,
            cemeteryCity: input.cemeteryCity,
        }),
        META_TEMPLATE_LIMITS.locationLabel
    );

    const prodotto = metaParamOrDash(
        formatFloristOrderProductsLabel(input.items),
        120
    );
    const accessori = metaParamOrDash(formatFloristAccessoriParam(input.items), 200);

    let ticket = stripNoise(input.ticketMessage);
    if (!ticket || /non specificato/i.test(ticket)) ticket = '';
    const testo = metaParamOrDash(ticket || 'Nessuno', META_TEMPLATE_LIMITS.ticketText);

    const compensation = calculateFloristCompensation(
        input.items as Parameters<typeof calculateFloristCompensation>[0],
        input.partnerNotes
    );
    const compenso = metaParamOrDash(
        formatFloristCompensationForTemplate(compensation),
        META_TEMPLATE_LIMITS.priceLabel
    );

    const deliveryUrl =
        stripNoise(input.deliveryUrl) ||
        buildFloristDeliveryUrl({
            id: input.orderId || orderCode,
            orderNumber: orderCode === '-' ? null : orderCode,
        });
    const link = metaParamOrDash(deliveryUrl, META_TEMPLATE_LIMITS.url);

    const params = [
        floristName, // {{1}}
        orderCode, // {{2}}
        deceased, // {{3}}
        deliveryWhen, // {{4}}
        comune, // {{5}}
        luogo, // {{6}}
        prodotto, // {{7}}
        accessori, // {{8}}
        testo, // {{9}}
        compenso, // {{10}}
        link, // {{11}}
    ];

    if (params.length !== FLORIST_NUOVO_ORDINE_BODY_PARAM_COUNT) {
        throw new Error(
            `florist_nuovo_ordine: attesi ${FLORIST_NUOVO_ORDINE_BODY_PARAM_COUNT} params, costruiti ${params.length}`
        );
    }

    // Guardia finale: mai undefined/null/empty verso Meta (#132000).
    return params.map((p) => (p && String(p).trim() ? String(p).trim() : '-'));
}
