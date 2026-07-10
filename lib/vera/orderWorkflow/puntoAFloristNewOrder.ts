import prisma from '@/lib/prisma';
import { calculateFloristCompensation, formatFloristCompensationForTemplate } from '@/lib/pricing/calculateFloristCompensation';
import { buildFloristDeliveryUrl } from '@/lib/orders/resolveOrderIdentifier';
import { extractFirstName } from '@/lib/whatsapp/proactiveTemplateParams';
import { sendVeraTemplate } from '@/lib/whatsapp/sendVeraTemplate';
import { logVeraTemplateOutbound } from '@/lib/whatsapp/logVeraTemplateOutbound';
import { normalizePhoneE164 } from '@/lib/whatsapp/metaCloudApiClient';
import { setVeraOperationalAlert } from '@/lib/vera/operationalAlerts';
import {
    detectIsFirstOrderForPartner,
    persistFirstOrderFlag,
} from '@/lib/vera/orderWorkflow/firstOrderDetection';
import {
    isWorkflowStepDone,
    markWorkflowStep,
    parseWorkflowFlags,
    sleep,
    TEMPLATE_CASCADE_DELAY_MS,
    type VeraWorkflowFlags,
} from '@/lib/vera/orderWorkflow/types';
import type { VeraTemplateId } from '@/lib/whatsapp/veraTemplateRegistry';
import {
    formatFloristCompensationParam,
    formatFloristDeceasedParam,
    formatFloristDeliveryPositionParam,
    formatFloristDeliveryUrlParam,
    formatFloristLocationParam,
    formatFloristOrderCodeParam,
} from '@/lib/whatsapp/floristTemplateCopy';

export interface PuntoAResult {
    ok: boolean;
    skipped?: string;
    blocked?: boolean;
    isFirstOrder?: boolean;
    error?: string;
}

export interface PuntoAOptions {
    /** Reinvio manuale anche se puntoA_florist già marcato. */
    force?: boolean;
}

function yesNo(value: boolean): string {
    return value ? 'Sì' : 'No';
}

function orderHasLumino(
    items: Array<{ product: { slug?: string | null; name?: string | null } }>
): boolean {
    return items.some((i) => {
        const label = `${i.product.slug || ''} ${i.product.name || ''}`.toLowerCase();
        return /lumino|set-ceri|ceri|candele/.test(label);
    });
}

function orderHasBigliettino(
    items: Array<{ product: { slug?: string | null; name?: string | null } }>,
    ticketMessage?: string | null
): boolean {
    if (ticketMessage?.trim()) return true;
    return items.some((i) => {
        const label = `${i.product.slug || ''} ${i.product.name || ''}`.toLowerCase();
        return /messaggio|bigliett|nastro/.test(label);
    });
}

async function updateWorkflowFlags(orderId: string, flags: VeraWorkflowFlags): Promise<void> {
    await prisma.order.update({
        where: { id: orderId },
        data: { veraWorkflowFlags: flags },
    });
}

async function logFloristTemplateToDashboard(input: {
    phoneE164: string;
    templateId: VeraTemplateId;
    bodyParams: string[];
    orderId: string;
    orderNumber: string;
    floristName: string;
    messageId?: string;
}): Promise<void> {
    try {
        await logVeraTemplateOutbound({
            phoneE164: input.phoneE164,
            templateId: input.templateId,
            bodyParams: input.bodyParams,
            eventType: 'FLORIST_NEW_ORDER_TEMPLATE',
            orderId: input.orderId,
            orderNumber: input.orderNumber,
            messageId: input.messageId,
            contactName: input.floristName,
            userType: 'FLORIST',
        });
    } catch (logErr) {
        console.error('[vera-workflow] Template fiorista inviato ma sessione dashboard non registrata:', {
            orderId: input.orderId,
            templateId: input.templateId,
            error: logErr,
        });
    }
}

type FloristCascadeStep = {
    template: 'florist_first_001' | 'florist_first_002' | 'florist_first_003' | 'florist_first_004';
    params: string[];
};

async function sendFloristCascade(input: {
    phoneE164: string;
    steps: FloristCascadeStep[];
    orderId: string;
    orderNumber: string;
    floristName: string;
    isFirstOrder: boolean;
}): Promise<PuntoAResult> {
    for (let i = 0; i < input.steps.length; i += 1) {
        const step = input.steps[i]!;
        const result = await sendVeraTemplate(input.phoneE164, step.template, step.params);
        if (!result.ok) {
            return {
                ok: false,
                isFirstOrder: input.isFirstOrder,
                error: result.error ?? `cascade_step_${i + 1}_failed`,
            };
        }
        await logFloristTemplateToDashboard({
            phoneE164: input.phoneE164,
            templateId: step.template,
            bodyParams: step.params,
            orderId: input.orderId,
            orderNumber: input.orderNumber,
            floristName: input.floristName,
            messageId: result.messageId,
        });
        if (i < input.steps.length - 1) await sleep(TEMPLATE_CASCADE_DELAY_MS);
    }
    return { ok: true, isFirstOrder: input.isFirstOrder };
}

function buildDeliveryPositionLabel(gravePosition: string, cemeteryLabel: string): string {
    if (gravePosition) return gravePosition;
    if (/casa funeraria|chiesa|sede/i.test(cemeteryLabel)) return 'Consegna in sede';
    return 'Indicazioni in app';
}

/**
 * PUNTO A — Notifica fiorista nuovo ordine (cascata template leggibile, mai il vecchio monolite con pipe).
 */
export async function runPuntoAFloristNewOrder(
    orderId: string,
    options: PuntoAOptions = {}
): Promise<PuntoAResult> {
    const order = await prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        include: {
            partner: true,
            items: { include: { product: true } },
        },
    });

    if (!order?.partnerId || !order.partner?.whatsappNumber?.trim()) {
        return { ok: false, skipped: 'no_partner_whatsapp' };
    }

    if (order.isTest) {
        return { ok: true, skipped: 'test_order' };
    }

    const flags = parseWorkflowFlags(order.veraWorkflowFlags);
    if (!options.force && isWorkflowStepDone(flags, 'puntoA_florist')) {
        return { ok: true, skipped: 'already_sent' };
    }

    const floristPhoneRaw = order.partner.whatsappNumber.trim();
    const floristPhoneE164 = normalizePhoneE164(floristPhoneRaw);
    if (!floristPhoneE164) {
        console.warn('[vera-workflow] Punto A saltato: telefono fiorista non valido', {
            orderId: order.id,
            orderNumber: order.orderNumber,
            whatsappNumber: floristPhoneRaw,
        });
        return { ok: false, skipped: 'invalid_florist_phone' };
    }

    const floristName = extractFirstName(order.partner.ownerName || order.partner.shopName);
    const deliveryUrl = buildFloristDeliveryUrl({ id: order.id, orderNumber: order.orderNumber });
    const compensation = calculateFloristCompensation(order.items);
    const compensationLabel = formatFloristCompensationForTemplate(compensation);
    const orderCode = order.orderNumber || order.id;
    const cemeteryLabel = [order.cemeteryName, order.cemeteryCity].filter(Boolean).join(', ');
    const gravePosition = order.gravePosition?.trim() || '';
    const deliveryPosition = formatFloristDeliveryPositionParam(
        buildDeliveryPositionLabel(gravePosition, cemeteryLabel)
    );
    const formattedOrderCode = formatFloristOrderCodeParam(orderCode);
    const formattedCompensation = formatFloristCompensationParam(compensationLabel);
    const formattedDeceased = formatFloristDeceasedParam(order.deceasedName);
    const formattedLocation = formatFloristLocationParam(cemeteryLabel);
    const formattedDeliveryUrl = formatFloristDeliveryUrlParam(deliveryUrl);

    if (compensation.totalCents === 0 && compensation.unmappedProducts.length > 0) {
        await setVeraOperationalAlert({
            orderId: order.id,
            type: 'listino_missing',
            message: `Compenso fiorista non calcolabile (listino): ${compensation.unmappedProducts.join(', ')}. Ordine ${orderCode}.`,
            priority: 'urgent',
            freezeOrder: false,
        }).catch(() => undefined);
    }

    const isFirst =
        order.isFirstOrderForPartner ??
        (await detectIsFirstOrderForPartner(order.id, order.partnerId));
    await persistFirstOrderFlag(order.id, isFirst);

    let cascadeResult: PuntoAResult;

    if (isFirst) {
        if (!gravePosition && !/casa funeraria|chiesa/i.test(cemeteryLabel)) {
            await setVeraOperationalAlert({
                orderId: order.id,
                type: 'grave_position_missing',
                message:
                    'Indicazioni tomba mancanti: invio automatico template fiorista (ft_003/004) bloccato. Inserire posizione tomba in dashboard.',
                priority: 'urgent',
                freezeOrder: true,
            });
            return { ok: false, blocked: true, isFirstOrder: true, error: 'grave_position_missing' };
        }

        const lumino = orderHasLumino(order.items);
        const bigliettino = orderHasBigliettino(order.items, order.ticketMessage);
        const ticketText = order.ticketMessage?.trim() || '—';

        cascadeResult = await sendFloristCascade({
            phoneE164: floristPhoneE164,
            orderId: order.id,
            orderNumber: orderCode,
            floristName,
            isFirstOrder: true,
            steps: [
                { template: 'florist_first_001', params: [floristName, formattedOrderCode, formattedCompensation] },
                { template: 'florist_first_002', params: [yesNo(lumino), yesNo(bigliettino), ticketText] },
                { template: 'florist_first_003', params: [formattedDeceased, formattedLocation, deliveryPosition] },
                { template: 'florist_first_004', params: [formattedDeliveryUrl] },
            ],
        });
    } else {
        const lumino = orderHasLumino(order.items);
        const bigliettino = orderHasBigliettino(order.items, order.ticketMessage);
        const repeatSteps: FloristCascadeStep[] = [
            { template: 'florist_first_001', params: [floristName, formattedOrderCode, formattedCompensation] },
            { template: 'florist_first_003', params: [formattedDeceased, formattedLocation, deliveryPosition] },
            { template: 'florist_first_004', params: [formattedDeliveryUrl] },
        ];
        if (lumino || bigliettino) {
            repeatSteps.splice(1, 0, {
                template: 'florist_first_002',
                params: [yesNo(lumino), yesNo(bigliettino), order.ticketMessage?.trim() || '—'],
            });
        }
        cascadeResult = await sendFloristCascade({
            phoneE164: floristPhoneE164,
            orderId: order.id,
            orderNumber: orderCode,
            floristName,
            isFirstOrder: false,
            steps: repeatSteps,
        });
    }

    if (!cascadeResult.ok) return cascadeResult;

    await updateWorkflowFlags(order.id, markWorkflowStep(flags, 'puntoA_florist'));
    console.info(`[vera-workflow] Punto A OK ordine ${orderCode} first=${isFirst}`);
    return { ok: true, isFirstOrder: isFirst };
}
