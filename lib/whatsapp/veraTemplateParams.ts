import { extractFirstNameFromProfile } from '@/lib/vera/genderFromName';
import { clampWarmThoughtForTemplate, MAX_WARM_THOUGHT_TEMPLATE_CHARS } from '@/lib/vera/clampWarmThought';
import { extractFirstName, normalizeOrderCode } from '@/lib/whatsapp/proactiveTemplateParams';
import { sanitizeMetaTemplateParam } from '@/lib/whatsapp/approvedTemplates';
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
const MAX_NAME_LEN = 48;

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

function requireText(value: string, slot: string, maxLen = 900): string {
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

export function buildCustomerOrderConfirmParams(input: {
    buyerFirstName?: string | null;
    deceasedName?: string | null;
    warmThought: string;
}): string[] {
    return buildVeraTemplateBodyParams('customer_order_confirm', {
        buyerFirstName: extractFirstNameFromProfile(input.buyerFirstName) || 'Utente',
        deceasedName: requireText(input.deceasedName || 'chi ama', 'deceasedName', 120),
        warmThought: requireText(
            clampWarmThoughtForTemplate(input.warmThought),
            'warmThought',
            MAX_WARM_THOUGHT_TEMPLATE_CHARS
        ),
    });
}

export function buildCustomerWaitingUpdateParams(input: {
    buyerFirstName?: string | null;
    deceasedName?: string | null;
}): string[] {
    return buildVeraTemplateBodyParams('customer_waiting_update', {
        buyerFirstName: extractFirstNameFromProfile(input.buyerFirstName) || 'Utente',
        deceasedName: requireText(input.deceasedName || 'chi ama', 'deceasedName', 120),
    });
}

export function buildCustomerDeliveryPhotoParams(input: {
    buyerFirstName?: string | null;
    partnerCity?: string | null;
    deceasedName?: string | null;
}): string[] {
    return buildVeraTemplateBodyParams('customer_delivery_photo', {
        buyerFirstName: extractFirstNameFromProfile(input.buyerFirstName) || 'Utente',
        partnerCity: requireText(input.partnerCity || 'zona', 'partnerCity', 80),
        deceasedName: requireText(input.deceasedName || 'chi ama', 'deceasedName', 120),
    });
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
