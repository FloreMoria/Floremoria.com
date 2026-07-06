import prisma from '@/lib/prisma';
import { calculateFloristCompensation } from '@/lib/pricing/calculateFloristCompensation';
import { buildFloristDeliveryUrl } from '@/lib/orders/resolveOrderIdentifier';
import { extractFirstName } from '@/lib/whatsapp/proactiveTemplateParams';
import { sendVeraTemplate } from '@/lib/whatsapp/sendVeraTemplate';
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

export interface PuntoAResult {
    ok: boolean;
    skipped?: string;
    blocked?: boolean;
    isFirstOrder?: boolean;
    error?: string;
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

/**
 * PUNTO A — Notifica fiorista nuovo ordine (cascata 4 template o singolo repeat).
 */
export async function runPuntoAFloristNewOrder(orderId: string): Promise<PuntoAResult> {
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

    const flags = parseWorkflowFlags(order.veraWorkflowFlags);
    if (isWorkflowStepDone(flags, 'puntoA_florist')) {
        return { ok: true, skipped: 'already_sent' };
    }

    const floristPhone = order.partner.whatsappNumber.trim();
    const floristName = extractFirstName(order.partner.ownerName || order.partner.shopName);
    const deliveryUrl = buildFloristDeliveryUrl({ id: order.id, orderNumber: order.orderNumber });
    const compensation = calculateFloristCompensation(order.items);
    const orderCode = order.orderNumber || order.id;
    const cemeteryLabel = [order.cemeteryName, order.cemeteryCity].filter(Boolean).join(', ');
    const gravePosition = order.gravePosition?.trim() || '';

    const isFirst =
        order.isFirstOrderForPartner ??
        (await detectIsFirstOrderForPartner(order.id, order.partnerId));
    await persistFirstOrderFlag(order.id, isFirst);

    if (isFirst) {
        if (!gravePosition) {
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

        const steps: Array<{ template: 'florist_first_001' | 'florist_first_002' | 'florist_first_003' | 'florist_first_004'; params: string[] }> = [
            { template: 'florist_first_001', params: [floristName, orderCode, compensation.totalLabel] },
            { template: 'florist_first_002', params: [yesNo(lumino), yesNo(bigliettino), ticketText] },
            { template: 'florist_first_003', params: [order.deceasedName, cemeteryLabel, gravePosition] },
            { template: 'florist_first_004', params: [deliveryUrl] },
        ];

        for (let i = 0; i < steps.length; i += 1) {
            const step = steps[i]!;
            const result = await sendVeraTemplate(floristPhone, step.template, step.params);
            if (!result.ok) {
                return {
                    ok: false,
                    isFirstOrder: true,
                    error: result.error ?? `cascade_step_${i + 1}_failed`,
                };
            }
            if (i < steps.length - 1) await sleep(TEMPLATE_CASCADE_DELAY_MS);
        }
    } else {
        const send = await sendVeraTemplate(floristPhone, 'florist_repeat', [
            floristName,
            order.deceasedName,
            cemeteryLabel,
            deliveryUrl,
            orderCode,
            compensation.totalLabel,
        ]);
        if (!send.ok) {
            return { ok: false, isFirstOrder: false, error: send.error };
        }
    }

    await updateWorkflowFlags(order.id, markWorkflowStep(flags, 'puntoA_florist'));
    console.info(`[vera-workflow] Punto A OK ordine ${orderCode} first=${isFirst}`);
    return { ok: true, isFirstOrder: isFirst };
}
