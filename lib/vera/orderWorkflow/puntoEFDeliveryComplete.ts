import prisma from '@/lib/prisma';
import { notifyCustomerDeliveryComplete } from '@/lib/deliveryProof/notifyCustomerDeliveryComplete';
import { extractFirstName } from '@/lib/whatsapp/proactiveTemplateParams';
import {
    isWorkflowStepDone,
    markWorkflowStep,
    parseWorkflowFlags,
} from '@/lib/vera/orderWorkflow/types';
import {
    releaseWorkflowStep,
    tryClaimWorkflowStep,
} from '@/lib/vera/orderWorkflow/claimWorkflowStep';
import {
    isWhatsAppAutoNotifyDisabledForOrder,
    shouldSkipTestOrderMetaSend,
} from '@/lib/whatsapp/outboundGuards';
import { buildProofFotoAccessUrl } from '@/lib/auth/proofFotoAccess';
import { normalizePhoneE164 } from '@/lib/whatsapp/metaCloudApiClient';
import { sendVeraTemplate } from '@/lib/whatsapp/sendVeraTemplate';
import { logVeraTemplateOutbound } from '@/lib/whatsapp/logVeraTemplateOutbound';
import { buildFloristRingraziamentoParams } from '@/lib/whatsapp/veraTemplateParams';
import { sendWhatsAppMessage } from '@/lib/whatsapp/sendWhatsAppMessage';
import { toWhatsAppSessionPhone } from '@/lib/whatsapp/sessionPhone';
import { addMessage } from '@/lib/chatStore';
import { buildOutboundWamidMetadata } from '@/lib/whatsapp/normalizeWamid';

export interface PuntoEFResult {
    ok: boolean;
    skipped?: string;
    giardinoUrl?: string;
    photosSent?: number;
    error?: string;
}

function buildFloristCompletionThanksFallbackText(input: {
    floristFirstName: string;
    orderCode: string;
}): string {
    return (
        `Grazie ${input.floristFirstName} per aver completato la consegna con successo! ` +
        `Abbiamo notificato il cliente con il link alle foto. ` +
        `Ti ricordiamo, se non l'hai già fatto, di inviarci la fattura relativa all'ordine ${input.orderCode}. ` +
        `Buon lavoro da FloreMoria! 🌹`
    );
}

/**
 * PUNTO E/F — Un solo messaggio cliente (claim atomico) + ringraziamento fiorista via template Meta.
 */
export async function runPuntoEFDeliveryComplete(orderId: string): Promise<PuntoEFResult> {
    const orderEarly = await prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        select: {
            id: true,
            orderNumber: true,
            isTest: true,
            veraWorkflowFlags: true,
        },
    });
    if (!orderEarly) return { ok: false, skipped: 'order_not_found' };
    if (isWhatsAppAutoNotifyDisabledForOrder(orderEarly.isTest)) {
        return { ok: true, skipped: 'auto_notify_disabled' };
    }
    if (shouldSkipTestOrderMetaSend(orderEarly.isTest)) {
        return { ok: true, skipped: 'test_order_meta_blocked' };
    }

    const flagsEarly = parseWorkflowFlags(orderEarly.veraWorkflowFlags);
    if (isWorkflowStepDone(flagsEarly, 'puntoEF_delivery')) {
        const giardinoUrl = await buildProofFotoAccessUrl(
            orderEarly.id,
            orderEarly.orderNumber
        ).catch(() => undefined);
        return { ok: true, skipped: 'already_done', giardinoUrl };
    }

    const claimed = await tryClaimWorkflowStep(orderEarly.id, 'puntoEF_delivery');
    if (!claimed) {
        const giardinoUrl = await buildProofFotoAccessUrl(
            orderEarly.id,
            orderEarly.orderNumber
        ).catch(() => undefined);
        return { ok: true, skipped: 'already_claimed', giardinoUrl };
    }

    const customerResult = await notifyCustomerDeliveryComplete(orderId);
    if (!customerResult.ok || customerResult.skipped) {
        await releaseWorkflowStep(orderEarly.id, 'puntoEF_delivery').catch((err) =>
            console.warn('[punto-ef] release claim fallito:', err)
        );
        return {
            ok: false,
            skipped: customerResult.skipped,
            giardinoUrl: customerResult.giardinoUrl,
            photosSent: customerResult.photosSent,
            error: customerResult.error,
        };
    }

    const order = await prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        include: { partner: true },
    });
    if (!order) return { ok: false, skipped: 'order_not_found' };

    const floristPhoneRaw = order.partner?.whatsappNumber?.trim();
    const floristPhoneE164 = normalizePhoneE164(floristPhoneRaw);
    if (floristPhoneE164) {
        const floristName = extractFirstName(
            order.partner?.ownerName || order.partner?.shopName || ''
        );
        const orderCode = order.orderNumber || order.id;
        const sessionPhone =
            toWhatsAppSessionPhone(floristPhoneE164) || `whatsapp:${floristPhoneE164}`;

        const bodyParams = buildFloristRingraziamentoParams({
            floristFirstName: floristName || 'Partner',
            orderCode,
        });

        const send = await sendVeraTemplate(floristPhoneE164, 'florist_ringraziamento', bodyParams, {
            orderId: order.id,
            orderNumber: orderCode,
            skipOrderDedup: true,
        });

        if (send.ok) {
            await logVeraTemplateOutbound({
                phoneE164: floristPhoneE164,
                templateId: 'florist_ringraziamento',
                bodyParams,
                eventType: 'FLORIST_DELIVERY_THANKS',
                orderId: order.id,
                orderNumber: orderCode,
                messageId: send.messageId,
                contactName: floristName || order.partner?.ownerName || 'Partner',
                userType: 'FLORIST',
            }).catch((err) => console.warn('[punto-ef] Log chat fiorista fallito:', err));
        } else {
            console.warn('[punto-ef] Template ringraziamento fiorista fallito, fallback free-text:', {
                orderId: order.id,
                orderNumber: orderCode,
                error: send.error,
                errorCode: send.errorCode,
            });

            const thanksText = buildFloristCompletionThanksFallbackText({
                floristFirstName: floristName || 'Partner',
                orderCode,
            });
            const fallback = await sendWhatsAppMessage(floristPhoneE164, thanksText, {
                recipientName: floristName || order.partner?.ownerName || 'Partner',
                orderCode,
                userType: 'FLORIST',
                source: 'punto_f_florist_thanks_fallback',
                sessionPhone,
                disableTemplateFallback: true,
            });

            if (fallback.ok && !fallback.fallbackExecuted) {
                await addMessage(sessionPhone, 'OUTBOUND', thanksText, undefined, {
                    eventType: 'FLORIST_DELIVERY_THANKS',
                    orderId: order.id,
                    orderNumber: orderCode,
                    source: 'punto_f_florist_thanks_fallback',
                    ...buildOutboundWamidMetadata(fallback.messageId),
                }).catch((err) => console.warn('[punto-ef] Log chat fallback fallito:', err));
            } else if (!fallback.ok) {
                console.error('[punto-ef] Ringraziamento fiorista fallito (template + fallback):', {
                    orderId: order.id,
                    orderNumber: orderCode,
                    phone: floristPhoneE164,
                    templateError: send.error,
                    fallbackError: fallback.error,
                    errorCode: fallback.errorCode,
                });
            }
        }
    } else if (floristPhoneRaw) {
        console.error('[punto-ef] Numero fiorista non normalizzabile:', {
            orderId: order.id,
            raw: floristPhoneRaw,
        });
    }

    const flags = parseWorkflowFlags(order.veraWorkflowFlags);
    if (!isWorkflowStepDone(flags, 'puntoEF_delivery')) {
        await prisma.order.update({
            where: { id: order.id },
            data: { veraWorkflowFlags: markWorkflowStep(flags, 'puntoEF_delivery') },
        });
    }

    return {
        ok: true,
        giardinoUrl: customerResult.giardinoUrl,
        photosSent: customerResult.photosSent,
    };
}
