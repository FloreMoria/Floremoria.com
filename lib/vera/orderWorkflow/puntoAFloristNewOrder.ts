import prisma from '@/lib/prisma';
import { calculateFloristCompensation, formatFloristCompensationForTemplate } from '@/lib/pricing/calculateFloristCompensation';
import { buildFloristDeliveryUrl } from '@/lib/orders/resolveOrderIdentifier';
import { buildFloristNewOrderWhatsAppText } from '@/lib/orders/floristDeliveryLinkMessage';
import { extractFirstName } from '@/lib/whatsapp/proactiveTemplateParams';
import { sendVeraTemplate } from '@/lib/whatsapp/sendVeraTemplate';
import { sendWhatsAppMessage } from '@/lib/whatsapp/sendWhatsAppMessage';
import { logVeraTemplateOutbound } from '@/lib/whatsapp/logVeraTemplateOutbound';
import { addMessage, getSession, markChatSessionAsTest, updateSessionProfile } from '@/lib/chatStore';
import { buildContactInitials } from '@/lib/whatsapp/sessionPhone';
import { normalizePhoneE164 } from '@/lib/whatsapp/metaCloudApiClient';
import { requiresTemplateMessage } from '@/lib/whatsapp/messagingWindow';
import { FIRST_OUTBOUND_TITLES } from '@/lib/whatsapp/firstOutboundTitle';
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
import { hasLuminoOption, orderHasBigliettinoOrRibbon } from '@/lib/orders/orderOptionals';
import {
    isWhatsAppAutoNotifyDisabledForOrder,
    shouldSkipTestOrderMetaSend,
} from '@/lib/whatsapp/outboundGuards';

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

function yesNo(value: boolean): string {
    return value ? 'Sì' : 'No';
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
    force?: boolean;
}): Promise<PuntoAResult> {
    let sentCount = 0;
    let skippedDuplicates = 0;

    for (let i = 0; i < input.steps.length; i += 1) {
        const step = input.steps[i]!;

        if (
            !input.force &&
            (await wasOrderTemplateSent(input.orderId, step.template, input.orderNumber))
        ) {
            skippedDuplicates += 1;
            console.info(
                `[vera-workflow] Punto A skip duplicato ${step.template} ordine ${input.orderNumber}`
            );
            continue;
        }

        const result = await sendVeraTemplate(input.phoneE164, step.template, step.params);
        if (!result.ok) {
            return {
                ok: false,
                isFirstOrder: input.isFirstOrder,
                error: result.error ?? `cascade_step_${i + 1}_failed`,
                sentCount,
                skippedDuplicates,
            };
        }
        sentCount += 1;
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

    if (sentCount === 0 && skippedDuplicates === input.steps.length) {
        return {
            ok: true,
            skipped: 'duplicate_order_template',
            isFirstOrder: input.isFirstOrder,
            sentCount: 0,
            skippedDuplicates,
        };
    }

    return {
        ok: true,
        isFirstOrder: input.isFirstOrder,
        sentCount,
        skippedDuplicates,
    };
}

function buildDeliveryPositionLabel(gravePosition: string, cemeteryLabel: string): string {
    if (gravePosition) return gravePosition;
    if (/casa funeraria|chiesa|sede/i.test(cemeteryLabel)) return 'Consegna in sede';
    return 'Indicazioni in app';
}

/**
 * PUNTO A — Notifica fiorista nuovo ordine (cascata template leggibile).
 * Non reinia template già spediti per lo stesso ordine.
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

    if (isWhatsAppAutoNotifyDisabledForOrder(order.isTest)) {
        console.warn(`[vera-workflow] Punto A saltato (AUTO_NOTIFY disabled) ordine ${order.orderNumber || order.id}`);
        return { ok: true, skipped: 'auto_notify_disabled' };
    }
    if (shouldSkipTestOrderMetaSend(order.isTest) && !options.force) {
        console.warn(`[vera-workflow] Punto A saltato (ordine test, Meta bloccato) ordine ${order.orderNumber || order.id}`);
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
    // Perché: il "rilascio orfano" re-inviava in loop: free-text / fallback 24h non loggavano
    // templateId florist_first_001 → dedup falliva → release → nuovo send (Martina/Simone spam).
    // Se il claim c'è, consideriamo inviato. Reinvio solo con force esplicito da staff.
    if (!options.force && isWorkflowStepDone(flags, 'puntoA_florist')) {
        return { ok: true, skipped: 'already_sent' };
    }

    // Claim atomico: evita due cascate parallele sullo stesso ordine.
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

    // Tomba mancante: solo avviso soft (non blocca). Si cancella se poi arriva la posizione.
    if (isFirst && !gravePosition && !/casa funeraria|chiesa/i.test(cemeteryLabel)) {
        await setVeraOperationalAlert({
            orderId: order.id,
            type: 'grave_position_missing',
            message:
                'Indicazioni tomba mancanti sull’ordine: cascata fiorista inviata con “Indicazioni in app”. Completare la posizione in dashboard.',
            priority: 'high',
            freezeOrder: false,
        }).catch(() => undefined);
    } else if (gravePosition) {
        // Posizione presente: non lasciare alert stale "tomba mancante".
        const { clearVeraOperationalAlert } = await import('@/lib/vera/operationalAlerts');
        const fresh = await prisma.order.findUnique({
            where: { id: order.id },
            select: { veraAlertType: true },
        });
        if (fresh?.veraAlertType === 'grave_position_missing') {
            await clearVeraOperationalAlert(order.id).catch(() => undefined);
        }
    }

    const messageText = buildFloristNewOrderWhatsAppText({
        floristFirstName: floristName,
        orderCode,
        city: order.cemeteryCity,
        deceasedName: order.deceasedName,
        cemeteryName: order.cemeteryName,
        cemeteryCity: order.cemeteryCity,
        gravePosition: order.gravePosition,
        ticketMessage: order.ticketMessage,
        additionalInstructions: order.additionalInstructions,
        items: order.items,
        deliveryUrl,
        orderId: order.id,
    });

    // Percorso primario: messaggio strutturato (prodotto dinamico + link mini-app).
    // Stesso numero del cliente / senza inbound recente → finestra 24h chiusa: Meta rifiuta il free-text.
    // In quel caso forziamo subito il template con HEADER "Nuovo Ordine FloreMoria".
    const sessionPhone = `whatsapp:${floristPhoneE164}`;
    let forceTemplate = false;
    try {
        const session = await getSession(sessionPhone);
        forceTemplate = requiresTemplateMessage(session);
    } catch {
        forceTemplate = true;
    }

    const freeTextSend = await sendWhatsAppMessage(floristPhoneE164, messageText, {
        recipientName: floristName,
        orderCode,
        headerTitle: FIRST_OUTBOUND_TITLES.floristNewOrder,
        userType: 'FLORIST',
        source: 'puntoA_florist_new_order',
        sessionPhone,
        forceTemplate,
    });

    if (freeTextSend.ok) {
        try {
            await updateSessionProfile(sessionPhone, {
                name: floristName,
                initials: buildContactInitials(floristName),
                userType: 'FLORIST',
                status: 'AI_ACTIVE',
                welcomeSent: true,
            });
            if (!freeTextSend.fallbackExecuted) {
                await addMessage(sessionPhone, 'OUTBOUND', messageText, undefined, {
                    eventType: 'FLORIST_NEW_ORDER_TEMPLATE',
                    templateId: 'florist_first_001',
                    outboundMode: 'free_text',
                    orderId: order.id,
                    orderNumber: orderCode,
                    ...(freeTextSend.messageId ? { whatsAppMessageId: freeTextSend.messageId } : {}),
                });
            } else {
                // Il testo è già in chat dal fallback/template forzato; marker solo per dedup.
                await addMessage(
                    sessionPhone,
                    'OUTBOUND',
                    `[Punto A] Ordine ${orderCode}: dettagli inviati via template (${FIRST_OUTBOUND_TITLES.floristNewOrder}).`,
                    undefined,
                    {
                        eventType: 'FLORIST_NEW_ORDER_TEMPLATE',
                        templateId: 'florist_first_001',
                        outboundMode: forceTemplate
                            ? 'template_forced_closed_window'
                            : 'template_fallback_24h_marker',
                        orderId: order.id,
                        orderNumber: orderCode,
                        ...(freeTextSend.messageId ? { whatsAppMessageId: freeTextSend.messageId } : {}),
                    }
                );
            }
            if (order.isTest) {
                await markChatSessionAsTest(sessionPhone);
            }
        } catch (logErr) {
            console.error('[vera-workflow] Punto A inviato ma sessione dashboard non registrata:', logErr);
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
            `[vera-workflow] Punto A OK (${forceTemplate || freeTextSend.fallbackExecuted ? 'template+header' : 'free_text'}) ordine ${orderCode}`
        );
        return { ok: true, isFirstOrder: isFirst, sentCount: 1, skippedDuplicates: 0 };
    }

    console.warn(
        `[vera-workflow] Messaggio strutturato fallito (${freeTextSend.error}). Fallback cascata Meta ordine ${orderCode}`
    );

    const lumino = hasLuminoOption(order.items);
    const bigliettino = orderHasBigliettinoOrRibbon(order.items, order.ticketMessage);
    const ticketText = order.ticketMessage?.trim() || 'Nessuno';

    const steps: FloristCascadeStep[] = isFirst
        ? [
              { template: 'florist_first_001', params: [floristName, formattedOrderCode, formattedCompensation] },
              { template: 'florist_first_002', params: [yesNo(lumino), yesNo(bigliettino), ticketText] },
              { template: 'florist_first_003', params: [formattedDeceased, formattedLocation, deliveryPosition] },
              { template: 'florist_first_004', params: [formattedDeliveryUrl] },
          ]
        : (() => {
              const repeatSteps: FloristCascadeStep[] = [
                  { template: 'florist_first_001', params: [floristName, formattedOrderCode, formattedCompensation] },
                  { template: 'florist_first_003', params: [formattedDeceased, formattedLocation, deliveryPosition] },
                  { template: 'florist_first_004', params: [formattedDeliveryUrl] },
              ];
              if (lumino || bigliettino) {
                  repeatSteps.splice(1, 0, {
                      template: 'florist_first_002',
                      params: [yesNo(lumino), yesNo(bigliettino), ticketText],
                  });
              }
              return repeatSteps;
          })();

    const cascadeResult = await sendFloristCascade({
        phoneE164: floristPhoneE164,
        orderId: order.id,
        orderNumber: orderCode,
        floristName,
        isFirstOrder: isFirst,
        force: options.force,
        steps,
    });

    // Meta #132001: template ft_* assenti sul WABA → fallback template unico florist_repeat.
    if (
        !cascadeResult.ok &&
        /132001|does not exist in the translation|template name does not exist/i.test(
            cascadeResult.error || ''
        )
    ) {
        console.warn(
            `[vera-workflow] Cascata ft_* non disponibile su Meta (${cascadeResult.error}). Fallback florist_repeat ordine ${orderCode}`
        );
        const fallback = await sendVeraTemplate(floristPhoneE164, 'florist_repeat', [
            floristName,
            formattedDeceased,
            formattedLocation,
            formattedDeliveryUrl,
            formattedOrderCode,
            formattedCompensation,
        ]);
        if (fallback.ok) {
            await logFloristTemplateToDashboard({
                phoneE164: floristPhoneE164,
                templateId: 'florist_repeat',
                bodyParams: [
                    floristName,
                    formattedDeceased,
                    formattedLocation,
                    formattedDeliveryUrl,
                    formattedOrderCode,
                    formattedCompensation,
                ],
                orderId: order.id,
                orderNumber: orderCode,
                floristName,
                messageId: fallback.messageId,
            });
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
            console.info(`[vera-workflow] Punto A OK via florist_repeat ordine ${orderCode}`);
            return { ok: true, isFirstOrder: isFirst, sentCount: 1, skippedDuplicates: 0 };
        }
        cascadeResult.error = `Messaggio strutturato e template Meta non disponibili. Dettaglio free-text: ${freeTextSend.error}; Meta: ${fallback.error || cascadeResult.error}`;
    }

    if (!cascadeResult.ok) {
        if (!options.force && claimed) {
            await releaseWorkflowStep(order.id, 'puntoA_florist');
        }
        await setVeraOperationalAlert({
            orderId: order.id,
            type: 'punto_a_send_failed',
            message: `Punto A fallito per ordine ${orderCode}: ${cascadeResult.error || freeTextSend.error || 'errore Meta'}.`,
            priority: 'urgent',
            freezeOrder: false,
        }).catch(() => undefined);
        return cascadeResult;
    }

    if (options.force) {
        const nextFlags = markWorkflowStep(flags, 'puntoA_florist');
        delete nextFlags.puntoA_florist_deferred;
        await updateWorkflowFlags(order.id, nextFlags);
    } else {
        const current = parseWorkflowFlags(
            (
                await prisma.order.findUnique({
                    where: { id: order.id },
                    select: { veraWorkflowFlags: true },
                })
            )?.veraWorkflowFlags
        );
        const nextFlags = { ...current };
        delete nextFlags.puntoA_florist_deferred;
        await updateWorkflowFlags(order.id, nextFlags);
    }
    console.info(
        `[vera-workflow] Punto A OK ordine ${orderCode} first=${isFirst} sent=${cascadeResult.sentCount ?? 0} dup=${cascadeResult.skippedDuplicates ?? 0}`
    );
    return cascadeResult;
}
