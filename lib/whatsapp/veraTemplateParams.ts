import {
    resolveCustomerConfirmSlot3,
    resolveSafeBuyerFirstName,
} from '@/lib/vera/customerOrderConfirmCopy';
import { extractFirstName, normalizeOrderCode } from '@/lib/whatsapp/proactiveTemplateParams';
import { sanitizeMetaTemplateParam } from '@/lib/whatsapp/approvedTemplates';
import { META_TEMPLATE_LIMITS } from '@/lib/whatsapp/metaTemplateLimits';
import {
    getVeraTemplate,
    type VeraTemplateId,
    type VeraTemplateSpec,
} from '@/lib/whatsapp/veraTemplateRegistry';

export class VeraTemplateParamError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'VeraTemplateParamError';
    }
}

const NAME_SLOT_PATTERN = /name|firstName|floristName|buyerFirstName/i;
const MAX_NAME_LEN = META_TEMPLATE_LIMITS.shortName;

function assertShortName(value: string, slot: string): string {
    const sanitized = sanitizeMetaTemplateParam(value, MAX_NAME_LEN);
    if (!sanitized) {
        throw new VeraTemplateParamError(`Parametro "${slot}" vuoto.`);
    }
    if (NAME_SLOT_PATTERN.test(slot)) {
        const words = sanitized.split(/\s+/).filter(Boolean);
        if (words.length > 3) {
            throw new VeraTemplateParamError(
                `Parametro "${slot}" sembra una frase intera (${words.length} parole). Usare solo il nome di battesimo.`
            );
        }
        if (sanitized.length > MAX_NAME_LEN) {
            throw new VeraTemplateParamError(
                `Parametro "${slot}" troppo lungo per il campo nome (max ${MAX_NAME_LEN} caratteri).`
            );
        }
    }
    return sanitized;
}

function requireText(value: string, slot: string, maxLen: number = META_TEMPLATE_LIMITS.general): string {
    const sanitized = sanitizeMetaTemplateParam(value, maxLen);
    if (!sanitized) {
        throw new VeraTemplateParamError(`Parametro "${slot}" vuoto.`);
    }
    return sanitized;
}

/** Ordina i parametri body secondo bodySlots del registry — blindatura anti-inversione. */
export function buildVeraTemplateBodyParams(
    templateId: VeraTemplateId,
    values: Record<string, string>
): string[] {
    const spec = getVeraTemplate(templateId);
    const params = spec.bodySlots.map((slot) => {
        const raw = values[slot];
        if (raw === undefined || raw === null || !String(raw).trim()) {
            // Meta #132000 / vuoti: fallback '-' invece di far fallire l'intero invio.
            console.warn(
                `[vera-template-params] ${templateId}: slot "${slot}" mancante → fallback "-"`
            );
            return '-';
        }
        if (NAME_SLOT_PATTERN.test(slot)) {
            return assertShortName(raw, slot);
        }
        return requireText(raw, slot);
    });

    if (params.length !== spec.bodyParamCount) {
        throw new VeraTemplateParamError(
            `Template ${spec.metaName}: attesi ${spec.bodyParamCount} parametri, costruiti ${params.length}.`
        );
    }

    return params;
}

function logBuiltTemplateParams(templateId: VeraTemplateId, params: string[]): void {
    const spec = getVeraTemplate(templateId);
    params.forEach((value, index) => {
        const slot = spec.bodySlots[index] ?? `body_${index + 1}`;
        // " " è valido per slot opzionali Meta (es. staffMessage).
        if (!value.trim() && value !== ' ') {
            console.error(`[vera-template-params] ${templateId} slot "${slot}" vuoto.`);
        }
        if (value.length > META_TEMPLATE_LIMITS.general) {
            console.warn(
                `[vera-template-params] ${templateId} slot "${slot}" lungo ${value.length} caratteri (max consigliato ${META_TEMPLATE_LIMITS.general}).`
            );
        }
    });
}

export function buildCustomerOrderConfirmParams(input: {
    buyerFirstName?: string | null;
    deceasedName?: string | null;
    /** Messaggio/domanda staff o Vera per {{3}}; se assente → " " (Meta #132000). */
    staffMessage?: string | null;
    /** Alias storico di staffMessage (warm thought auto). */
    warmThought?: string | null;
}): string[] {
    const slot3 = resolveCustomerConfirmSlot3(input.staffMessage ?? input.warmThought);
    // Costruzione esplicita: buildVeraTemplateBodyParams trasformerebbe " " in "-".
    const params = [
        resolveSafeBuyerFirstName(input.buyerFirstName),
        requireText(
            input.deceasedName || 'chi ama',
            'deceasedName',
            META_TEMPLATE_LIMITS.deceasedName
        ),
        slot3,
    ];
    const spec = getVeraTemplate('customer_order_confirm');
    if (params.length !== spec.bodyParamCount) {
        throw new VeraTemplateParamError(
            `Template ${spec.metaName}: attesi ${spec.bodyParamCount} parametri, costruiti ${params.length}.`
        );
    }
    logBuiltTemplateParams('customer_order_confirm', params);
    return params;
}

export function buildCustomerWaitingUpdateParams(input: {
    buyerFirstName?: string | null;
    deceasedName?: string | null;
}): string[] {
    const params = buildVeraTemplateBodyParams('customer_waiting_update', {
        buyerFirstName: resolveSafeBuyerFirstName(input.buyerFirstName),
        deceasedName: requireText(
            input.deceasedName || 'chi ama',
            'deceasedName',
            META_TEMPLATE_LIMITS.deceasedName
        ),
    });
    logBuiltTemplateParams('customer_waiting_update', params);
    return params;
}

export function buildCustomerDeliveryPhotoHeaderParams(partnerCity?: string | null): string[] {
    return [requireText(partnerCity || 'zona', 'partnerCity', 80)];
}

export function buildCustomerDeliveryPhotoParams(input: {
    buyerFirstName?: string | null;
    partnerCity?: string | null;
    deceasedName?: string | null;
    magicLink: string;
}): string[] {
    const params = buildVeraTemplateBodyParams('customer_delivery_photo', {
        buyerFirstName: resolveSafeBuyerFirstName(input.buyerFirstName),
        partnerCity: requireText(input.partnerCity || 'zona', 'partnerCity', 80),
        deceasedName: requireText(
            input.deceasedName || 'chi ama',
            'deceasedName',
            META_TEMPLATE_LIMITS.deceasedName
        ),
        magicLink: requireText(input.magicLink, 'magicLink', 500),
    });
    logBuiltTemplateParams('customer_delivery_photo', params);
    return params;
}

/** @deprecated Usa buildCustomerDeliveryPhotoParams (stesso mapping Meta 4 variabili). */
export function buildOrdineCompletatoParams(input: {
    buyerFirstName?: string | null;
    deceasedName?: string | null;
    partnerCity?: string | null;
    magicLink: string;
}): string[] {
    return buildCustomerDeliveryPhotoParams({
        buyerFirstName: input.buyerFirstName,
        partnerCity: input.partnerCity,
        deceasedName: input.deceasedName,
        magicLink: input.magicLink,
    });
}

export function buildFloristReminderParams(input: {
    floristFirstName?: string | null;
    orderCode?: string | null;
    /** Link mini-app / MagicLink — Meta {{3}} su floremoria_sollecito_fiorista. */
    deliveryUrl?: string | null;
    /** @deprecated Meta non usa più il defunto su questo template. */
    deceasedName?: string | null;
}): string[] {
    void input.deceasedName;
    return buildVeraTemplateBodyParams('florist_reminder', {
        floristFirstName: extractFirstName(input.floristFirstName || 'Fiorista') || 'Fiorista',
        orderCode: requireText(normalizeOrderCode(input.orderCode || '') || '-', 'orderCode', 40),
        deliveryUrl: requireText(
            input.deliveryUrl || 'https://www.floremoria.com',
            'deliveryUrl',
            META_TEMPLATE_LIMITS.url
        ),
    });
}

export function buildProactiveStaffParams(input: {
    floristFirstName?: string | null;
    orderCode?: string | null;
    staffNotes: string;
}): { bodyParams: string[]; headerTextParams: string[] } {
    return {
        // Template FT body-only: nessun header.
        headerTextParams: [],
        bodyParams: buildVeraTemplateBodyParams('proactive_staff', {
            floristFirstName: extractFirstName(input.floristFirstName || 'Fiorista') || 'Fiorista',
            orderCode: requireText(normalizeOrderCode(input.orderCode || '') || '-', 'orderCode', 40),
            staffNotes: requireText(input.staffNotes, 'staffNotes'),
        }),
    };
}

/** Template Meta promemoria_anniversario_gdm — Scenario A body-only. */
export function buildAnniversaryGdmReminderParams(input: {
    userFirstName?: string | null;
    deceasedName?: string | null;
    catalogUrl?: string | null;
}): { bodyParams: string[]; headerTextParams: string[] } {
    const rememberedPerson = requireText(
        input.deceasedName || 'il Suo caro',
        'rememberedPerson',
        META_TEMPLATE_LIMITS.deceasedName
    );
    const bodyParams = buildVeraTemplateBodyParams('anniversary_gdm_reminder', {
        userFirstName: extractFirstName(input.userFirstName || 'Cliente') || 'Cliente',
        rememberedPerson,
        catalogUrl: requireText(
            input.catalogUrl || 'https://www.floremoria.com/fiori-sulle-tombe',
            'catalogUrl',
            META_TEMPLATE_LIMITS.url
        ),
    });
    logBuiltTemplateParams('anniversary_gdm_reminder', bodyParams);
    return {
        headerTextParams: [rememberedPerson],
        bodyParams,
    };
}

export function describeTemplateParamMapping(spec: VeraTemplateSpec): string {
    return `body: ${spec.bodySlots.map((slot, i) => `{{${i + 1}}}=${slot}`).join(', ')}`;
}
