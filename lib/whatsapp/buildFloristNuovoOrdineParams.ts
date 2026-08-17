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
import { metaParamOrDash, formatFloristPriceAmountParam } from '@/lib/whatsapp/floristTemplateCopy';
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
    // Var 1: Nome Fiorista (saluto gestito da template "Ciao {{1}}! 🌸")
    let rawFlorist = stripNoise(input.floristFirstName);
    rawFlorist = rawFlorist.replace(/^Ciao\s+/i, '').replace(/!\s*🌸?$/i, '').trim();
    const floristName = extractFirstName(rawFlorist || '') || rawFlorist || 'Fiorista';
    const var1 = metaParamOrDash(floristName, 100);

    // Var 2: Codice Ordine (etichetta gestita da template "📦 Nuovo ordine: {{2}}")
    let rawCode = stripNoise(input.orderCode);
    rawCode = rawCode.replace(/^📦\s*Nuovo\s+ordine:\s*/i, '').replace(/^📦\s*Codice\s+ordine:\s*/i, '').trim();
    const orderCode = rawCode && rawCode !== '-' ? rawCode : '-';
    const var2 = metaParamOrDash(orderCode, 100);

    // Var 3: Defunto (etichetta gestita da template "🕊️ In memoria di: {{3}}")
    let rawDeceased = stripNoise(input.deceasedName);
    rawDeceased = rawDeceased.replace(/^🕊️\s*In\s+memoria\s+di:\s*/i, '').replace(/^per\s+/i, '').trim();
    const deceased = rawDeceased && rawDeceased !== '-' ? rawDeceased : 'il caro defunto';
    const var3 = metaParamOrDash(deceased, 120);

    // Var 4: Data Consegna (etichetta gestita da template "📅 Consegna entro: {{4}}")
    const deadline = resolveFloristDeliveryDeadline({
        deliveryDate: input.deliveryDate,
        requestedDeliveryDate: input.requestedDeliveryDate,
        createdAt: input.createdAt,
    });
    let rawDeadline = stripNoise(deadline.label);
    rawDeadline = rawDeadline.replace(/^📅\s*Consegna\s+entro:\s*/i, '').replace(/^📅\s*CONSEGNA\s+ENTRO:\s*/i, '').trim();
    const deliveryWhen = rawDeadline && rawDeadline !== '-' ? rawDeadline : '-';
    const var4 = metaParamOrDash(deliveryWhen, 150);

    // Var 5 & Var 6: Comune e Luogo (etichetta gestita da template "📍 Destinazione: {{5}}, {{6}}")
    let rawComune = stripNoise(
        formatFloristComuneParam({
            city: input.cemeteryCity,
            province: input.province,
        })
    );
    rawComune = rawComune.replace(/^📍\s*Comune:\s*/i, '').trim();
    if (rawComune === '-') rawComune = '';

    let rawLuogo = stripNoise(
        formatFloristLuogoParam({
            cemeteryName: input.cemeteryName,
            cemeteryCity: input.cemeteryCity,
        })
    );
    rawLuogo = rawLuogo.replace(/^🏛️\s*Luogo:\s*/i, '').trim();
    if (rawLuogo === '-') rawLuogo = '';

    let var5 = '';
    let var6 = '';
    if (!rawComune) {
        // Se il comune è vuoto, mostriamo solo il luogo
        var5 = metaParamOrDash(rawLuogo || '-', 150);
        var6 = ' '; // Spazio per soddisfare la convalida non-vuoto di Meta
    } else {
        var5 = metaParamOrDash(rawComune, 150);
        var6 = metaParamOrDash(rawLuogo || '-', 150);
    }

    // Var 7: Prodotto (etichetta gestita da template "💐 Prodotto: {{7}}")
    let rawProdotto = stripNoise(formatFloristOrderProductsLabel(input.items));
    rawProdotto = rawProdotto.replace(/^💐\s*Prodotto:\s*/i, '').trim();
    const prodotto = rawProdotto && rawProdotto !== '-' ? rawProdotto : '-';
    const var7 = metaParamOrDash(prodotto, 150);

    // Var 8: Accessori (etichetta gestita da template "➕ Accessori: {{8}}")
    let rawAccessori = stripNoise(formatFloristAccessoriParam(input.items));
    rawAccessori = rawAccessori.replace(/^➕\s*Accessori:\s*/i, '').trim();
    const accessori = rawAccessori && rawAccessori !== '-' ? rawAccessori : 'Nessun accessorio extra';
    const var8 = metaParamOrDash(accessori, 220);

    // Var 9: Testo (etichetta gestita da template "📝 Testo nastro/biglietto: {{9}}")
    let rawTicket = stripNoise(input.ticketMessage);
    rawTicket = rawTicket.replace(/^📝\s*Testo\s+nastro\/biglietto:\s*/i, '').trim();
    if (!rawTicket || /non specificato/i.test(rawTicket) || rawTicket === '-') {
        rawTicket = 'Nessuno';
    }
    const var9 = metaParamOrDash(rawTicket, META_TEMPLATE_LIMITS.ticketText);

    // Var 10: Compenso (etichetta gestita da template "💶 Compenso per il servizio: {{10}}€")
    const compensation = calculateFloristCompensation(
        input.items as Parameters<typeof calculateFloristCompensation>[0],
        input.partnerNotes
    );
    const rawCompenso = stripNoise(formatFloristCompensationForTemplate(compensation));
    // Estraiamo solo il numero (es. "20") usando la funzione dedicata
    const cleanCompenso = formatFloristPriceAmountParam(rawCompenso);
    const var10 = metaParamOrDash(cleanCompenso, 100);

    // Var 11: Link (etichetta gestita da template "🔗 Link mini-app fiorista: {{11}}" o testo libero)
    const rawDeliveryUrl =
        stripNoise(input.deliveryUrl) ||
        buildFloristDeliveryUrl({
            id: input.orderId || orderCode,
            orderNumber: orderCode === '-' ? null : orderCode,
        });
    let rawLink = rawDeliveryUrl.replace(/^🔗\s*Link\s+mini-app\s+fiorista:\s*/i, '').trim();
    const link = rawLink && rawLink !== '-' ? rawLink : '-';
    const var11 = metaParamOrDash(link, META_TEMPLATE_LIMITS.url);

    const params = [
        var1,  // {{1}}
        var2,  // {{2}}
        var3,  // {{3}}
        var4,  // {{4}}
        var5,  // {{5}}
        var6,  // {{6}}
        var7,  // {{7}}
        var8,  // {{8}}
        var9,  // {{9}}
        var10, // {{10}}
        var11, // {{11}}
    ];

    if (params.length !== FLORIST_NUOVO_ORDINE_BODY_PARAM_COUNT) {
        throw new Error(
            `florist_nuovo_ordine: attesi ${FLORIST_NUOVO_ORDINE_BODY_PARAM_COUNT} params, costruiti ${params.length}`
        );
    }

    // Guardia finale: mai undefined/null/empty verso Meta (#132000).
    return params.map((p) => (p && String(p).trim() ? String(p).trim() : '-'));
}

/**
 * Mappa i 11 body params Meta → chiavi form dashboard (bodySlots florist_repeat).
 */
export function floristNuovoOrdineParamsToFieldValues(params: string[]): Record<string, string> {
    const keys = [
        'floristFirstName',
        'orderCode',
        'deceasedName',
        'deliveryDeadline',
        'deliveryCity',
        'deliveryPlace',
        'productLabel',
        'accessories',
        'ticketText',
        'floristPrice',
        'deliveryUrl',
    ] as const;
    const out: Record<string, string> = {};
    keys.forEach((key, i) => {
        out[key] = (params[i] && String(params[i]).trim()) || '-';
    });
    return out;
}
