/**
 * Parametri body per Meta `floremoria_nuovo_ordine_fiorista` (11 variabili, solo body).
 * Ordine tassativo allineato al template APPROVED sul WABA FloreMoria.
 */

import { buildFloristDeliveryUrl } from '@/lib/orders/resolveOrderIdentifier';
import { resolveFloristDeliveryDeadline } from '@/lib/orders/formatFloristDeliveryDeadline';
import { formatFloristOrderProductsLabel } from '@/lib/orders/formatFloristProductLabel';
import {
    formatFloristAccessoriesLine,
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
import { formatDeceasedName } from '@/lib/utils/formatDeceasedName';

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
    /** Indirizzo consegna alternativo se non c'è nome cimitero. */
    deliveryAddress?: string | null;
    /** Posizione della tomba / loculo nel cimitero. */
    gravePosition?: string | null;
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

/** True se il valore è assente o placeholder inutile (mai stampare "Non specificato"). */
export function isUnspecifiedPlaceValue(value: string | null | undefined): boolean {
    const v = stripNoise(value);
    if (!v || v === '-' || v === '—') return true;
    return /^(non\s*specificato|n\/?d|n\.?\s*d\.?|da\s+definire|undefined|null)$/i.test(v);
}

function formatProvinceSuffix(province?: string | null): string {
    let prov = stripNoise(province).replace(/[()]/g, '');
    if (isUnspecifiedPlaceValue(prov)) return '';
    return ` (${prov.toUpperCase()})`;
}

/** {{5}} Comune — es. «Pordenone (PN)». Mai "Non specificato". */
export function formatFloristComuneParam(input: {
    city?: string | null;
    province?: string | null;
}): string {
    let city = stripNoise(input.city);
    if (isUnspecifiedPlaceValue(city)) city = '';
    const provSuffix = formatProvinceSuffix(input.province);
    if (city && provSuffix) return `${city}${provSuffix}`;
    if (city) return city;
    return '-';
}

/**
 * {{6}} Luogo (slot Meta accanto a {{5}} comune) — toponimo cimitero/indirizzo + posizione tomba se disponibile.
 * Mai "Non specificato". Fallback: «Cimitero Comunale di ${city}».
 */
export function formatFloristLuogoParam(input: {
    cemeteryName?: string | null;
    cemeteryCity?: string | null;
    province?: string | null;
    deliveryAddress?: string | null;
    gravePosition?: string | null;
}): string {
    const city = isUnspecifiedPlaceValue(input.cemeteryCity) ? '' : stripNoise(input.cemeteryCity);
    const grave = isUnspecifiedPlaceValue(input.gravePosition) ? '' : stripNoise(input.gravePosition);

    let place = '';
    if (!isUnspecifiedPlaceValue(input.cemeteryName)) {
        place = stripNoise(input.cemeteryName);
    } else if (!isUnspecifiedPlaceValue(input.deliveryAddress)) {
        place = stripNoise(input.deliveryAddress);
    }

    let luogoBase = '';
    if (place) {
        luogoBase = /^(cimitero|casa funeraria|chiesa|area)\b/i.test(place) ? place : `Cimitero di ${place}`;
    } else if (city) {
        luogoBase = `Cimitero Comunale di ${city}`;
    } else {
        luogoBase = '-';
    }

    if (luogoBase === '-') {
        return grave ? `Posizione tomba: ${grave}` : '-';
    }

    if (grave) {
        return `${luogoBase} (Posizione: ${grave})`;
    }
    return `${luogoBase} (Posizione: In aggiornamento dallo Staff)`;
}

/**
 * Riga Luogo unica (free-text / anteprima): cimitero + comune + provincia.
 * Es. «Cimitero di Monumentale - Pordenone (PN)» oppure «Cimitero Comunale di Pordenone (PN)».
 */
export function formatFloristLuogoDisplayLine(input: {
    cemeteryName?: string | null;
    cemeteryCity?: string | null;
    province?: string | null;
    deliveryAddress?: string | null;
    gravePosition?: string | null;
}): string {
    const city = isUnspecifiedPlaceValue(input.cemeteryCity) ? '' : stripNoise(input.cemeteryCity);
    const provSuffix = formatProvinceSuffix(input.province);
    const placeCore = formatFloristLuogoParam(input);

    if (placeCore !== '-' && city && !placeCore.includes(city)) {
        return `${placeCore} - ${city}${provSuffix}`;
    }
    if (placeCore !== '-' && city && /cimitero comunale di/i.test(placeCore)) {
        // «Cimitero Comunale di City» + eventuale provincia
        return `${placeCore}${provSuffix}`;
    }
    if (placeCore !== '-') {
        return `${placeCore}${provSuffix}`;
    }
    if (city) return `Area di ${city}${provSuffix}`;
    return 'Area da confermare in app';
}

/**
 * URL mini-app pulito (solo https…), senza etichette né punteggiatura finale.
 * Perché: WhatsApp evidenzia l'URL solo se non è attaccato ai due punti o al punto di fine frase.
 */
export function formatFloristMiniAppUrlParam(
    url: string | null | undefined,
    opts?: { whatsAppTrailingSpace?: boolean }
): string {
    let raw = stripNoise(url);
    raw = raw
        .replace(/^🔗\s*Per favore,\s*completa l'ordine con la mini-app:\s*/i, '')
        .replace(/^🔗\s*Link\s+mini-app\s+fiorista:\s*/i, '')
        .trim();
    raw = raw.replace(/[.,!?;:]+$/, '').trim();
    if (!raw || raw === '-') return '-';
    // Garantisce schema https per anteprima card.
    if (/^www\./i.test(raw)) raw = `https://${raw}`;
    const capped = metaParamOrDash(raw, META_TEMPLATE_LIMITS.url);
    if (capped === '-') return capped;
    // Spazio finale: separa l'URL dal "." del template Meta (floremoria_sollecito_fiorista).
    return opts?.whatsAppTrailingSpace ? `${capped} ` : capped;
}

/** Riga completa: URL su riga dedicata (mai seguito da punto sulla stessa riga). */
export function formatFloristMiniAppInstructionLine(url: string): string {
    const clean = formatFloristMiniAppUrlParam(url);
    // Fallback: home sito (non /fiorista — non esiste una pagina indice fiorista).
    const href = clean === '-' ? 'https://www.floremoria.com' : clean;
    return `🔗 Per favore, completa l'ordine con la mini-app:\n${href}`;
}

/** {{8}} Accessori. */
export function formatFloristAccessoriParam(
    items: OrderItemLike[],
    ticketMessage?: string | null
): string {
    return formatFloristAccessoriesLine(items, ticketMessage, {
        includePhotoBefore: true,
        photoBeforeLabel: 'Foto stato di fatto prima della consegna',
    });
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
    const deceased = formatDeceasedName(rawDeceased, 'il caro defunto');
    const var3 = metaParamOrDash(deceased, 120);

    // Var 4: Data Consegna (etichetta gestita da template "📅 CONSEGNA : {{4}}")
    const deadline = resolveFloristDeliveryDeadline({
        deliveryDate: input.deliveryDate,
        requestedDeliveryDate: input.requestedDeliveryDate,
        createdAt: input.createdAt,
    });
    let rawDeadline = stripNoise(deadline.label);
    rawDeadline = rawDeadline.replace(/^📅\s*Consegna\s+entro:\s*/i, '').replace(/^📅\s*CONSEGNA\s*:\s*/i, '').trim();
    const deliveryWhen = rawDeadline && rawDeadline !== '-' ? rawDeadline : '-';
    const var4 = metaParamOrDash(deliveryWhen, 150);

    // Var 5 & Var 6: Luogo (template "📍 Luogo: {{5}}, {{6}}") — mai "Non specificato".
    const var5 = metaParamOrDash(
        formatFloristComuneParam({
            city: input.cemeteryCity,
            province: input.province,
        }),
        150
    );
    const var6 = metaParamOrDash(
        formatFloristLuogoParam({
            cemeteryName: input.cemeteryName,
            cemeteryCity: input.cemeteryCity,
            province: input.province,
            deliveryAddress: input.deliveryAddress,
            gravePosition: input.gravePosition,
        }),
        150
    );

    // Var 7: Prodotto (etichetta gestita da template "💐 Prodotto: {{7}}")
    let rawProdotto = stripNoise(formatFloristOrderProductsLabel(input.items));
    rawProdotto = rawProdotto.replace(/^💐\s*Prodotto:\s*/i, '').trim();
    const prodotto = rawProdotto && rawProdotto !== '-' ? rawProdotto : '-';
    const var7 = metaParamOrDash(prodotto, 150);

    // Var 8: Accessori (etichetta gestita da template "➕ Optional / Accessori: {{8}}")
    let rawAccessori = stripNoise(formatFloristAccessoriParam(input.items, input.ticketMessage));
    rawAccessori = rawAccessori.replace(/^➕\s*Accessori:\s*/i, '').replace(/^➕\s*Optional\s*\/\s*Accessori:\s*/i, '').trim();
    const accessori = rawAccessori && rawAccessori !== '-' ? rawAccessori : 'Nessuno';
    const var8 = metaParamOrDash(accessori, 220);

    // Var 9: Testo (etichetta gestita da template "📝 Testo: {{9}}")
    let rawTicket = stripNoise(input.ticketMessage);
    rawTicket = rawTicket.replace(/^📝\s*Testo\s*:\s*/i, '').replace(/^📝\s*Testo\s+nastro\/biglietto:\s*/i, '').trim();
    if (!rawTicket || /non specificato/i.test(rawTicket) || rawTicket === '-') {
        rawTicket = 'Nessuno';
    }
    const var9 = metaParamOrDash(rawTicket, META_TEMPLATE_LIMITS.ticketText);

    // Var 10: Compenso (etichetta gestita da template "💶 Compenso per il servizio: {{10}}")
    const compensation = calculateFloristCompensation(
        input.items as Parameters<typeof calculateFloristCompensation>[0],
        input.partnerNotes
    );
    const rawCompenso = stripNoise(formatFloristCompensationForTemplate(compensation));
    const cleanCompenso = formatFloristPriceAmountParam(rawCompenso);
    // Poiché il template Meta non ha il simbolo € hardcoded, lo aggiungiamo se il valore è numerico
    const compensoVal = /^\d+$/.test(cleanCompenso) ? `${cleanCompenso}€` : cleanCompenso;
    const var10 = metaParamOrDash(compensoVal, 100);

    // Var 11: Link mini-app — solo URL https (spazio dopo ":" è nel body Meta / free-text).
    const rawDeliveryUrl =
        stripNoise(input.deliveryUrl) ||
        buildFloristDeliveryUrl({
            id: input.orderId || orderCode,
            orderNumber: orderCode === '-' ? null : orderCode,
        });
    const var11 = formatFloristMiniAppUrlParam(rawDeliveryUrl, { whatsAppTrailingSpace: true });

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
