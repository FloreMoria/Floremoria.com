import {
    finalizeCustomerConfirmWarmSlot,
    CUSTOMER_ORDER_CONFIRM_BODY_CANONICAL,
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
        if (raw === undefined || raw === null) {
            throw new VeraTemplateParamError(
                `Template ${spec.metaName}: manca il valore per lo slot "${slot}" (${spec.bodySlots.join(', ')}).`
            );
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
        if (!value.trim()) {
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
    warmThought: string;
}): string[] {
    const params = buildVeraTemplateBodyParams('customer_order_confirm', {
        buyerFirstName: resolveSafeBuyerFirstName(input.buyerFirstName),
        deceasedName: requireText(
            input.deceasedName || 'chi ama',
            'deceasedName',
            META_TEMPLATE_LIMITS.deceasedName
        ),
        warmThought: requireText(
            finalizeCustomerConfirmWarmSlot(input.warmThought),
            'warmThought',
            META_TEMPLATE_LIMITS.warmThought
        ),
    });
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

export function buildCustomerDeliveryPhotoParams(input: {
    buyerFirstName?: string | null;
    partnerCity?: string | null;
    deceasedName?: string | null;
}): string[] {
    const params = buildVeraTemplateBodyParams('customer_delivery_photo', {
        buyerFirstName: resolveSafeBuyerFirstName(input.buyerFirstName),
        partnerCity: requireText(input.partnerCity || 'zona', 'partnerCity', 80),
        deceasedName: requireText(
            input.deceasedName || 'chi ama',
            'deceasedName',
            META_TEMPLATE_LIMITS.deceasedName
        ),
    });
    logBuiltTemplateParams('customer_delivery_photo', params);
    return params;
}

export function buildFloristReminderParams(input: {
    floristFirstName?: string | null;
    orderCode?: string | null;
    deceasedName?: string | null;
}): string[] {
    return buildVeraTemplateBodyParams('florist_reminder', {
        floristFirstName: extractFirstName(input.floristFirstName || 'Fiorista') || 'Fiorista',
        orderCode: requireText(normalizeOrderCode(input.orderCode || ''), 'orderCode', 40),
        deceasedName: requireText(input.deceasedName || 'defunto', 'deceasedName', 120),
    });
}

export function buildProactiveStaffParams(input: {
    floristFirstName?: string | null;
    orderCode?: string | null;
    staffNotes: string;
}): { bodyParams: string[]; headerTextParams: string[] } {
    return {
        headerTextParams: [
            requireText(normalizeOrderCode(input.orderCode || ''), 'orderCode', 40),
        ],
        bodyParams: buildVeraTemplateBodyParams('proactive_staff', {
            floristFirstName: extractFirstName(input.floristFirstName || 'Fiorista') || 'Fiorista',
            staffNotes: requireText(input.staffNotes, 'staffNotes'),
        }),
    };
}

export function describeTemplateParamMapping(spec: VeraTemplateSpec): string {
    const header =
        spec.headerTextParamCount && spec.headerTextParamCount > 0
            ? `header: ${spec.headerSlots?.join(', ') ?? 'n/a'} | `
            : '';
    return `${header}body: ${spec.bodySlots.map((slot, i) => `{{${i + 1}}}=${slot}`).join(', ')}`;
}
