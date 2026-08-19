import prisma from '@/lib/prisma';
import { calculateFloristCompensation } from '@/lib/pricing/calculateFloristCompensation';
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
import { wasOrderTemplateSent } from '@/lib/vera/orderWorkflow/orderOutboundDedup';
import {
    releaseWorkflowStep,
    tryClaimWorkflowStep,
} from '@/lib/vera/orderWorkflow/claimWorkflowStep';
import {
    isWorkflowStepDone,
    markWorkflowStep,
    parseWorkflowFlags,
    type VeraWorkflowFlags,
} from '@/lib/vera/orderWorkflow/types';
import {
    buildFloristNuovoOrdineBodyParams,
    FLORIST_NUOVO_ORDINE_BODY_PARAM_COUNT,
} from '@/lib/whatsapp/buildFloristNuovoOrdineParams';
import {
    isWhatsAppAutoNotifyDisabledForOrder,
    shouldSkipTestOrderMetaSend,
} from '@/lib/whatsapp/outboundGuards';
import { veraAutomationBlockedSkipReason } from '@/lib/vera/orderWorkflow/blockPendingAutomation';

export interface PuntoAResult {
    ok: boolean;
    skipped?: string;
    blocked?: boolean;
    isFirstOrder?: boolean;
    error?: string;
    sentCount?: number;
    skippedDuplicates?: number;
}

export interface PuntoAOptions {
    /** Reinvio manuale esplicito — ignora dedup/workflow solo con force=true. */
    force?: boolean;
}

async function updateWorkflowFlags(orderId: string, flags: VeraWorkflowFlags): Promise<void> {
    await prisma.order.update({
        where: { id: orderId },
        data: { veraWorkflowFlags: flags },
    });
}

/**
 * PUNTO A — Notifica fiorista nuovo ordine.
 * Template unico Meta `floremoria_nuovo_ordine_fiorista` (11 variabili body, nessun header).
 * Mai free-text: fuori finestra 24h Meta risponde 131047.
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
        await setVeraOperationalAlert({
            orderId: orderId,
            type: 'florist_whatsapp_missing',
            message:
                'Punto A non inviato: fiorista senza WhatsApp valido. Compilare il numero sul profilo fiorista.',
            priority: 'urgent',
            freezeOrder: false,
        }).catch(() => undefined);
        return { ok: false, skipped: 'no_partner_whatsapp' };
    }

    const pendingBlock = veraAutomationBlockedSkipReason(order.status);
    if (pendingBlock) {
        console.info(
            `[vera-workflow] Punto A BLOCCATO (stato ATTESA/PENDING, solo manuale) ordine ${order.orderNumber || order.id}`
        );
        return { ok: true, skipped: pendingBlock };
    }

    if (isWhatsAppAutoNotifyDisabledForOrder(order.isTest)) {
        console.warn(
            `[vera-workflow] Punto A saltato (AUTO_NOTIFY disabled) ordine ${order.orderNumber || order.id}`
        );
        return { ok: true, skipped: 'auto_notify_disabled' };
    }
    if (shouldSkipTestOrderMetaSend(order.isTest) && !options.force) {
        console.warn(
            `[vera-workflow] Punto A saltato (ordine test, Meta bloccato) ordine ${order.orderNumber || order.id}`
        );
        await setVeraOperationalAlert({
            orderId: order.id,
            type: 'punto_a_send_failed',
            message:
                'Punto A non inviato: ordine isTest ma WHATSAPP_ALLOW_TEST_SENDS≠1 sul runtime Vercel. Aggiungere la env e RIDISTRIBUIRE, poi ritentare.',
            priority: 'urgent',
            freezeOrder: false,
        }).catch(() => undefined);
        return { ok: false, skipped: 'test_order_meta_blocked' };
    }

    const flags = parseWorkflowFlags(order.veraWorkflowFlags);
    if (!options.force && isWorkflowStepDone(flags, 'puntoA_florist')) {
        return { ok: true, skipped: 'already_sent' };
    }

    let claimed = true;
    if (!options.force) {
        claimed = await tryClaimWorkflowStep(order.id, 'puntoA_florist');
        if (!claimed) {
            console.info(
                `[vera-workflow] Punto A BLOCCATO claim (già preso) ordine ${order.orderNumber || order.id}`
            );
            return { ok: true, skipped: 'already_sent' };
        }
    }

    const floristPhoneRaw = order.partner.whatsappNumber.trim();
    const floristPhoneE164 = normalizePhoneE164(floristPhoneRaw);
    if (!floristPhoneE164) {
        if (!options.force && claimed) await releaseWorkflowStep(order.id, 'puntoA_florist');
        console.warn('[vera-workflow] Punto A saltato: telefono fiorista non valido', {
            orderId: order.id,
            orderNumber: order.orderNumber,
            whatsappNumber: floristPhoneRaw,
        });
        await setVeraOperationalAlert({
            orderId: order.id,
            type: 'florist_whatsapp_missing',
            message: `Punto A non inviato: WhatsApp fiorista non valido (${floristPhoneRaw}).`,
            priority: 'urgent',
            freezeOrder: false,
        }).catch(() => undefined);
        return { ok: false, skipped: 'invalid_florist_phone' };
    }

    const floristName =
        extractFirstName(order.partner.ownerName || order.partner.shopName) || 'Fiorista';
    const orderCode = order.orderNumber || order.id;
    const deliveryUrl = buildFloristDeliveryUrl({ id: order.id, orderNumber: order.orderNumber });
    const compensation = calculateFloristCompensation(order.items, order.partner?.internalNotes);
    const { formatFloristLuogoDisplayLine, isUnspecifiedPlaceValue } = await import(
        '@/lib/whatsapp/buildFloristNuovoOrdineParams'
    );
    const cemeteryLabel = formatFloristLuogoDisplayLine({
        cemeteryName: isUnspecifiedPlaceValue(order.cemeteryName) ? null : order.cemeteryName,
        cemeteryCity: order.cemeteryCity,
        province: order.deliveryProvince,
    });
    const gravePosition = order.gravePosition?.trim() || '';

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

    if (isFirst && !gravePosition && !/casa funeraria|chiesa/i.test(cemeteryLabel)) {
        await setVeraOperationalAlert({
            orderId: order.id,
            type: 'grave_position_missing',
            message:
                'Indicazioni tomba mancanti sull’ordine: notifica fiorista inviata senza dettaglio posizione. Completare in dashboard.',
            priority: 'high',
            freezeOrder: false,
        }).catch(() => undefined);
    } else if (gravePosition) {
        const { clearVeraOperationalAlert } = await import('@/lib/vera/operationalAlerts');
        const fresh = await prisma.order.findUnique({
            where: { id: order.id },
            select: { veraAlertType: true },
        });
        if (fresh?.veraAlertType === 'grave_position_missing') {
            await clearVeraOperationalAlert(order.id).catch(() => undefined);
        }
    }

    if (!options.force && (await wasOrderTemplateSent(order.id, 'florist_repeat', orderCode))) {
        console.info(
            `[vera-workflow] Punto A skip duplicato florist_repeat ordine ${orderCode}`
        );
        const nextFlags = markWorkflowStep(
            parseWorkflowFlags(
                (
                    await prisma.order.findUnique({
                        where: { id: order.id },
                        select: { veraWorkflowFlags: true },
                    })
                )?.veraWorkflowFlags
            ),
            'puntoA_florist'
        );
        delete nextFlags.puntoA_florist_deferred;
        await updateWorkflowFlags(order.id, nextFlags);
        return {
            ok: true,
            skipped: 'duplicate_order_template',
            isFirstOrder: isFirst,
            sentCount: 0,
            skippedDuplicates: 1,
        };
    }

    // Template principale: floremoria_nuovo_ordine_fiorista — 11 body params, no header.
    const bodyParams = buildFloristNuovoOrdineBodyParams({
        floristFirstName: floristName,
        orderCode,
        deceasedName: order.deceasedName,
        cemeteryName: order.cemeteryName,
        cemeteryCity: order.cemeteryCity,
        province: order.deliveryProvince,
        ticketMessage: order.ticketMessage,
        items: order.items,
        partnerNotes: order.partner?.internalNotes,
        deliveryDate: order.deliveryDate,
        createdAt: order.createdAt,
        orderId: order.id,
        deliveryUrl,
    });

    console.info(
        `[vera-workflow] Punto A florist_repeat (11 params) ordine ${orderCode} first=${isFirst} params=${JSON.stringify(bodyParams)}`
    );

    if (bodyParams.length !== FLORIST_NUOVO_ORDINE_BODY_PARAM_COUNT) {
        if (!options.force && claimed) await releaseWorkflowStep(order.id, 'puntoA_florist');
        const err = `florist_repeat: attesi ${FLORIST_NUOVO_ORDINE_BODY_PARAM_COUNT} params, costruiti ${bodyParams.length}`;
        await setVeraOperationalAlert({
            orderId: order.id,
            type: 'punto_a_send_failed',
            message: `Punto A fallito per ordine ${orderCode}: ${err}.`,
            priority: 'urgent',
            freezeOrder: false,
        }).catch(() => undefined);
        return { ok: false, error: err, isFirstOrder: isFirst };
    }

    const send = await sendVeraTemplate(floristPhoneE164, 'florist_repeat', bodyParams, {
        orderId: order.id,
        orderNumber: order.orderNumber,
    });

    if (!send.ok) {
        if (!options.force && claimed) await releaseWorkflowStep(order.id, 'puntoA_florist');
        await setVeraOperationalAlert({
            orderId: order.id,
            type: 'punto_a_send_failed',
            message: `Punto A fallito per ordine ${orderCode}: ${send.error || 'errore Meta template'}.`,
            priority: 'urgent',
            freezeOrder: false,
        }).catch(() => undefined);
        return {
            ok: false,
            error: send.error || 'template_send_failed',
            isFirstOrder: isFirst,
            sentCount: 0,
        };
    }

    try {
        await logVeraTemplateOutbound({
            phoneE164: floristPhoneE164,
            templateId: 'florist_repeat',
            bodyParams,
            eventType: 'FLORIST_NEW_ORDER_TEMPLATE',
            orderId: order.id,
            orderNumber: orderCode,
            messageId: send.messageId,
            contactName: floristName,
            userType: 'FLORIST',
        });
    } catch (logErr) {
        console.error('[vera-workflow] Template fiorista inviato ma sessione dashboard non registrata:', {
            orderId: order.id,
            error: logErr,
        });
    }

    const nextFlags = markWorkflowStep(
        parseWorkflowFlags(
            (
                await prisma.order.findUnique({
                    where: { id: order.id },
                    select: { veraWorkflowFlags: true },
                })
            )?.veraWorkflowFlags
        ),
        'puntoA_florist'
    );
    delete nextFlags.puntoA_florist_deferred;
    await updateWorkflowFlags(order.id, nextFlags);

    const { clearVeraOperationalAlert } = await import('@/lib/vera/operationalAlerts');
    await clearVeraOperationalAlert(order.id).catch(() => undefined);

    console.info(
        `[vera-workflow] Punto A OK florist_repeat ordine ${orderCode} first=${isFirst} wamid=${send.messageId ?? 'N/A'}`
    );
    return { ok: true, isFirstOrder: isFirst, sentCount: 1, skippedDuplicates: 0 };
}
