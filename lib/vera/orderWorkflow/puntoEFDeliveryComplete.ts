import prisma from '@/lib/prisma';
import { notifyCustomerDeliveryComplete } from '@/lib/deliveryProof/notifyCustomerDeliveryComplete';
import { buildProactiveStaffParams } from '@/lib/whatsapp/veraTemplateParams';
import { extractFirstName } from '@/lib/whatsapp/proactiveTemplateParams';
import { sendVeraTemplate } from '@/lib/whatsapp/sendVeraTemplate';
import {
    isWorkflowStepDone,
    markWorkflowStep,
    parseWorkflowFlags,
} from '@/lib/vera/orderWorkflow/types';
import {
    isWhatsAppAutoNotifyDisabledForOrder,
    shouldSkipTestOrderMetaSend,
} from '@/lib/whatsapp/outboundGuards';
import { addMessage, getSession } from '@/lib/chatStore';
import { isWithinCustomerServiceWindow } from '@/lib/whatsapp/messagingWindow';
import { sendWhatsAppTextMessage } from '@/lib/whatsapp/metaCloudApiClient';
import { buildOutboundWamidMetadata } from '@/lib/whatsapp/normalizeWamid';
import { buildProofFotoAccessUrl } from '@/lib/auth/proofFotoAccess';

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
        `Le foto sono state inviate al cliente. ` +
        `Ti ricordiamo, se non l'hai già fatto, di inviarci la fattura relativa all'ordine ${input.orderCode}. ` +
        `Buon lavoro da FloreMoria! 🌹`
    );
}

/**
 * PUNTO E/F — Tutte le foto utente + ringraziamento fiorista con promemoria fattura.
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

    const customerResult = await notifyCustomerDeliveryComplete(orderId);
    if (!customerResult.ok) {
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

    const flags = parseWorkflowFlags(order.veraWorkflowFlags);
    if (!isWorkflowStepDone(flags, 'puntoEF_delivery')) {
        if (order.partner?.whatsappNumber?.trim()) {
            const floristName = extractFirstName(
                order.partner.ownerName || order.partner.shopName
            );
            const orderCode = order.orderNumber || order.id;
            const thanksText = buildFloristCompletionThanksMessage({
                floristFirstName: floristName || 'Partner',
                orderCode,
            });

            const sessionPhone = `whatsapp:${order.partner.whatsappNumber}`;
            const session = await getSession(sessionPhone);
            const withinWindow = isWithinCustomerServiceWindow(session);

            if (withinWindow) {
                const send = await sendWhatsAppTextMessage(order.partner.whatsappNumber, thanksText);
                if (send.ok) {
                    await addMessage(sessionPhone, 'OUTBOUND', thanksText, undefined, {
                        eventType: 'FLORIST_DELIVERY_THANKS',
                        orderId: order.id,
                        orderNumber: orderCode,
                        source: 'punto_f_florist_thanks',
                        ...buildOutboundWamidMetadata(send.messageId),
                    }).catch((err) =>
                        console.warn('[punto-ef] Log chat fiorista fallito:', err)
                    );
                }
            } else {
                const staffNote =
                    `Grazie per aver completato la consegna con successo! Le foto sono state inviate al cliente. ` +
                    `Ti ricordiamo, se non l'hai già fatto, di inviarci la fattura relativa all'ordine ${orderCode}. ` +
                    `Buon lavoro da FloreMoria!`;

                const { bodyParams, headerTextParams } = buildProactiveStaffParams({
                    floristFirstName: floristName || 'Partner',
                    orderCode,
                    staffNotes: staffNote,
                });

                const templateSend = await sendVeraTemplate(
                    order.partner.whatsappNumber,
                    'proactive_staff',
                    bodyParams,
                    { headerTextParams }
                );
                if (templateSend.ok) {
                    await addMessage(sessionPhone, 'OUTBOUND', thanksText, undefined, {
                        eventType: 'FLORIST_DELIVERY_THANKS',
                        orderId: order.id,
                        orderNumber: orderCode,
                        source: 'punto_f_florist_thanks_template',
                        ...buildOutboundWamidMetadata(templateSend.messageId),
                    }).catch((err) =>
                        console.warn('[punto-ef] Log chat fiorista template fallito:', err)
                    );
                }
            }
        }

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
