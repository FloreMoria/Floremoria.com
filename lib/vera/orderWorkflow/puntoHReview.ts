import prisma from '@/lib/prisma';
import { GOOGLE_REVIEW_URL } from '@/lib/whatsapp/veraTemplateRegistry';
import { sendWhatsAppTextMessage, normalizePhoneE164 } from '@/lib/whatsapp/metaCloudApiClient';
import {
    isWorkflowStepDone,
    markWorkflowStep,
    parseWorkflowFlags,
} from '@/lib/vera/orderWorkflow/types';

const HAPPY_REPLY_PATTERN =
    /grazie|perfett|bellissim|magnific|content|felic|emozion|commoss|splendid|meraviglios/i;

export function isHappyPostDeliveryReply(message: string): boolean {
    return HAPPY_REPLY_PATTERN.test(message);
}

export interface PuntoHResult {
    sent: boolean;
    skipped?: string;
}

/**
 * PUNTO H — Link recensioni Google se utente felice, senza recensioni precedenti.
 */
export async function tryRunPuntoHReviewRequest(input: {
    orderId: string;
    userId?: string | null;
    customerPhone?: string | null;
    message: string;
}): Promise<PuntoHResult> {
    if (!isHappyPostDeliveryReply(input.message)) {
        return { sent: false, skipped: 'not_happy_reply' };
    }

    const order = await prisma.order.findFirst({
        where: { id: input.orderId, deletedAt: null },
        include: {
            deliveryProof: true,
            user: { select: { id: true, hasLeftGoogleReview: true } },
        },
    });

    if (!order || order.deliveryProof?.status !== 'COMPLETED') {
        return { sent: false, skipped: 'delivery_not_complete' };
    }

    const flags = parseWorkflowFlags(order.veraWorkflowFlags);
    if (isWorkflowStepDone(flags, 'puntoH_review')) {
        return { sent: false, skipped: 'already_sent' };
    }

    const userId = input.userId || order.userId;
    if (userId) {
        const user = order.user ?? (await prisma.user.findUnique({
            where: { id: userId },
            select: { hasLeftGoogleReview: true },
        }));
        if (user?.hasLeftGoogleReview) {
            return { sent: false, skipped: 'already_reviewed' };
        }

        const pastOrders = await prisma.order.count({
            where: {
                userId,
                deletedAt: null,
                partnerPaymentStatus: 'PAID',
                id: { not: order.id },
                deliveryProof: { status: 'COMPLETED' },
            },
        });
        if (pastOrders > 0) {
            return { sent: false, skipped: 'has_past_orders' };
        }
    }

    const phoneE164 = normalizePhoneE164(input.customerPhone || order.customerPhone);
    if (!phoneE164) return { sent: false, skipped: 'invalid_phone' };

    const text =
        `La ringraziamo di cuore per le Sue parole. Se desidera, può lasciare una recensione qui: ${GOOGLE_REVIEW_URL}\n\n` +
        'Il Suo feedback ci aiuta a prendere cura di ogni ricordo con ancora più dedizione.';

    const send = await sendWhatsAppTextMessage(phoneE164, text);
    if (!send.ok) return { sent: false, skipped: send.error };

    await prisma.order.update({
        where: { id: order.id },
        data: { veraWorkflowFlags: markWorkflowStep(flags, 'puntoH_review') },
    });

    if (userId) {
        await prisma.user.update({
            where: { id: userId },
            data: { hasLeftGoogleReview: true },
        }).catch(() => undefined);
    }

    return { sent: true };
}
