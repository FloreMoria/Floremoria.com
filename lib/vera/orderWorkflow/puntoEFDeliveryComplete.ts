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
import { addMessage } from '@/lib/chatStore';
import { normalizePhoneE164 } from '@/lib/whatsapp/metaCloudApiClient';
import { buildOutboundWamidMetadata } from '@/lib/whatsapp/normalizeWamid';
import { buildProofFotoAccessUrl } from '@/lib/auth/proofFotoAccess';
import { sendWhatsAppMessage } from '@/lib/whatsapp/sendWhatsAppMessage';
import { toWhatsAppSessionPhone } from '@/lib/whatsapp/sessionPhone';

export interface PuntoEFResult {
    ok: boolean;
    skipped?: string;
    giardinoUrl?: string;
    photosSent?: number;
    error?: string;
}

function buildFloristCompletionThanksMessage(input: {
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
 * PUNTO E/F — Un solo messaggio cliente (claim atomico) + ringraziamento fiorista.
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

    // Claim prima dell'invio: evita doppio WhatsApp su invocazioni parallele (mini-app + status).
    const claimed = await tryClaimWorkflowStep(orderEarly.id, 'puntoEF_delivery');
    if (!claimed) {
        const giardinoUrl = await buildProofFotoAccessUrl(
            orderEarly.id,
            orderEarly.orderNumber
        ).catch(() => undefined);
        return { ok: true, skipped: 'already_claimed', giardinoUrl };
    }

    const customerResult = await notifyCustomerDeliveryComplete(orderId);
    if (!customerResult.ok) {
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
        const thanksText = buildFloristCompletionThanksMessage({
            floristFirstName: floristName || 'Partner',
            orderCode,
        });
        const sessionPhone =
            toWhatsAppSessionPhone(floristPhoneE164) || `whatsapp:${floristPhoneE164}`;

        const send = await sendWhatsAppMessage(floristPhoneE164, thanksText, {
            recipientName: floristName || order.partner?.ownerName || 'Partner',
            orderCode,
            userType: 'FLORIST',
            source: 'punto_f_florist_thanks',
            sessionPhone,
        });

        if (send.ok) {
            if (!send.fallbackExecuted) {
                await addMessage(sessionPhone, 'OUTBOUND', thanksText, undefined, {
                    eventType: 'FLORIST_DELIVERY_THANKS',
                    orderId: order.id,
                    orderNumber: orderCode,
                    source: 'punto_f_florist_thanks',
                    ...buildOutboundWamidMetadata(send.messageId),
                }).catch((err) =>
                    console.warn('[punto-ef] Log chat fiorista fallito:', err)
                );
            } else {
                console.info('[punto-ef] Ringraziamento fiorista inviato via template 24h', {
                    orderId: order.id,
                    orderNumber: orderCode,
                    messageId: send.messageId,
                });
            }
        } else {
            console.error('[punto-ef] Ringraziamento fiorista fallito:', {
                orderId: order.id,
                orderNumber: orderCode,
                phone: floristPhoneE164,
                error: send.error,
                errorCode: send.errorCode,
            });
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
