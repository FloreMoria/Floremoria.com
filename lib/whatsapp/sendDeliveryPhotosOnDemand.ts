/**
 * Invio on-demand delle 2 foto principali di posa (Prima / Dopo)
 * quando l'utente risponde «Sì» / «Inviatemi le foto» / «foto».
 */
import prisma from '@/lib/prisma';
import { addMessage, getSession } from '@/lib/chatStore';
import { getOrderProofPhotos } from '@/lib/deliveryProof/proofPhotoUrls';
import { ensureWhatsAppDeliveryImageUrl } from '@/lib/whatsapp/deliveryImageStaging';
import { isWithinCustomerServiceWindow } from '@/lib/whatsapp/messagingWindow';
import { buildOutboundWamidMetadata } from '@/lib/whatsapp/normalizeWamid';
import {
    isMetaCloudConfigured,
    normalizePhoneE164,
    sendWhatsAppImageMessage,
} from '@/lib/whatsapp/metaCloudApiClient';
import { lookupLastOrderByPhone } from '@/lib/whatsapp/orderStatusInquiry';

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SendDeliveryPhotosOnDemandResult {
    ok: boolean;
    skipped?: string;
    photosSent?: number;
    orderId?: string;
    error?: string;
}

/**
 * Rileva richieste esplicite di ricevere le foto in chat
 * (pulsante rapido / risposta a «Vuole ricevere qui la foto della posa?»).
 */
export function isRequestingDeliveryPhotosInChat(message: string): boolean {
    const raw = (message || '').trim();
    if (!raw) return false;

    if (isDecliningDeliveryPhotosInChat(message)) return false;

    // Sanitizza pulendo emoji (es. 🌹, 👍, 🙏, ❤️) e punteggiatura per il matching pulito
    const clean = raw
        .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
        .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, '')
        .trim()
        .toLowerCase();

    if (!clean) return false;

    // Affermativi corti ed espressioni di consenso (es. "Sì", "Sì 🌹", "Si", "Si grazie", "Sì per favore", "Certo")
    if (
        /^(s[iì]|si+|yes|ok|okay|va\s+bene|certo|prego|volentieri|desidero|confermo)(\s+(grazie|mille|di\s+cuore|per\s+favore|per\s+piacere|le\s+foto))?$/i.test(
            clean
        )
    ) {
        return true;
    }

    return (
        /inviatemi\s+le\s+foto/i.test(clean) ||
        /inviami\s+le\s+foto/i.test(clean) ||
        /mandami\s+le\s+foto/i.test(clean) ||
        /mandatemi\s+le\s+foto/i.test(clean) ||
        /voglio\s+(vedere\s+)?le\s+foto/i.test(clean) ||
        /ricevere\s+(qui\s+)?(la\s+)?foto/i.test(clean) ||
        /le\s+foto\s+(per\s+)?(favore|piacere)/i.test(clean) ||
        /^(foto|le foto|foto per favore|foto please)$/i.test(clean)
    );
}

/** Risposta negativa alla domanda «Vuole ricevere qui la foto della posa?». */
export function isDecliningDeliveryPhotosInChat(message: string): boolean {
    const t = (message || '').trim().toLowerCase();
    if (!t) return false;
    if (/^(no|nò|nope)$/i.test(t)) return true;
    if (/^no[,!.\s]/i.test(t) && !/non\s+ho\s+ricevut/i.test(t)) return true;
    return (
        /no\s+grazie/i.test(t) ||
        /non\s+(serve|occorre|le voglio)/i.test(t) ||
        /basta\s+(il\s+)?link/i.test(t) ||
        /solo\s+(il\s+)?link/i.test(t) ||
        /preferisco\s+(il\s+)?link/i.test(t)
    );
}

/** Ringraziamento / ack generico senza richiesta foto. */
export function isPoliteDeliveryAckWithoutPhotos(message: string): boolean {
    const t = (message || '').trim().toLowerCase();
    if (!t || isRequestingDeliveryPhotosInChat(t) || isDecliningDeliveryPhotosInChat(t)) {
        return false;
    }
    return /^(grazie|grazie mille|grazie di cuore|perfetto|ricevuto|ok grazie|va bene grazie|grazie,?\s*ok|👍|🙏|❤️|🌹)+[!!.]*$/i.test(
        t
    );
}

export function buildDeliveryPhotoDeclineOrAckReply(firstName?: string | null): string {
    const who = firstName?.trim() ? `Gentile ${firstName.trim()}, ` : '';
    return (
        `${who}La ringraziamo di cuore. ` +
        `Può sempre rivedere le foto nel Suo Giardino della Memoria tramite il link già inviato. ` +
        `Restiamo a Sua completa disposizione.\nLo Staff di FloreMoria 🌹`
    );
}

async function resolveCompletedOrderForPhotos(input: {
    phoneE164: string;
    orderId?: string | null;
}): Promise<{
    id: string;
    orderNumber: string | null;
    buyerFullName: string | null;
    deceasedName: string | null;
    cemeteryCity: string | null;
    cemeteryName: string | null;
    deliveryProvince: string | null;
    before: string[];
    after: string[];
} | null> {
    if (input.orderId) {
        const order = await prisma.order.findFirst({
            where: { id: input.orderId, deletedAt: null },
            include: { deliveryProof: true, user: { select: { name: true } } },
        });
        if (order?.deliveryProof?.status === 'COMPLETED') {
            const photos = getOrderProofPhotos(order);
            return {
                id: order.id,
                orderNumber: order.orderNumber,
                buyerFullName: order.user?.name || order.buyerFullName,
                deceasedName: order.deceasedName,
                cemeteryCity: order.cemeteryCity,
                cemeteryName: order.cemeteryName,
                deliveryProvince: order.deliveryProvince,
                before: photos.before,
                after: photos.after,
            };
        }
    }

    const last = await lookupLastOrderByPhone(input.phoneE164);
    if (!last || last.deliveryProof?.status !== 'COMPLETED') return null;
    const photos = getOrderProofPhotos(last);
    return {
        id: last.id,
        orderNumber: last.orderNumber,
        buyerFullName: last.buyerFullName,
        deceasedName: last.deceasedName,
        cemeteryCity: last.cemeteryCity,
        cemeteryName: last.cemeteryName,
        deliveryProvince: last.deliveryProvince,
        before: photos.before,
        after: photos.after,
    };
}

/**
 * Invia fino a 2 foto: 1 Prima + 1 Dopo (o le disponibili).
 */
export async function sendDeliveryPhotosOnDemand(input: {
    phoneE164: string;
    orderId?: string | null;
    buyerFullName?: string | null;
}): Promise<SendDeliveryPhotosOnDemandResult> {
    if (!isMetaCloudConfigured()) {
        return { ok: false, skipped: 'meta_not_configured' };
    }

    const phoneE164 = normalizePhoneE164(input.phoneE164);
    if (!phoneE164) return { ok: false, skipped: 'invalid_phone' };

    const order = await resolveCompletedOrderForPhotos({
        phoneE164,
        orderId: input.orderId,
    });
    if (!order) {
        return { ok: false, skipped: 'no_completed_order' };
    }

    const primaryUrls = [
        order.before[0],
        order.after[0] || order.after[1],
    ].filter((u): u is string => Boolean(u?.trim()));

    // Se manca lo slot prima, manda fino a 2 "dopo".
    const urls =
        primaryUrls.length > 0
            ? primaryUrls.slice(0, 2)
            : [...order.before, ...order.after].filter(Boolean).slice(0, 2);

    if (urls.length === 0) {
        return { ok: false, skipped: 'missing_photo', orderId: order.id };
    }

    const sessionPhone = `whatsapp:${phoneE164}`;
    const session = await getSession(sessionPhone);
    const withinWindow = isWithinCustomerServiceWindow(session);

    const publicUrls: string[] = [];
    for (let i = 0; i < urls.length; i += 1) {
        const publicUrl = await ensureWhatsAppDeliveryImageUrl(
            `${order.id}-ondemand-${i}`,
            urls[i]!
        );
        if (!/^https:\/\//i.test(publicUrl)) {
            return { ok: false, skipped: 'invalid_image_url', orderId: order.id };
        }
        publicUrls.push(publicUrl);
    }

    let photosSent = 0;
    let lastMessageId: string | undefined;

    // Dopo la risposta Sì la finestra 24h è aperta: solo image free-text (niente template media a freddo).
    if (!withinWindow) {
        console.warn(
            `[delivery-photos-ondemand] Finestra ancora chiusa per ${phoneE164} — provo comunque image (inbound dovrebbe averla aperta).`
        );
    }

    for (let i = 0; i < publicUrls.length; i += 1) {
        if (i > 0) await sleep(800);
        const label =
            i === 0 && order.before[0]
                ? 'Foto prima della posa'
                : 'Foto dopo la posa';
        const imageSend = await sendWhatsAppImageMessage(
            phoneE164,
            publicUrls[i]!,
            i === 0 ? `${label} 🌹` : label
        );
        if (!imageSend.ok) {
            return {
                ok: false,
                skipped: 'image_send_failed',
                orderId: order.id,
                photosSent,
                error: imageSend.error,
            };
        }
        photosSent += 1;
        lastMessageId = imageSend.messageId;
        await addMessage(sessionPhone, 'OUTBOUND', label, publicUrls[i], {
            eventType: 'PROOF_OF_DELIVERY_ON_DEMAND',
            orderId: order.id,
            ...(order.orderNumber ? { orderNumber: order.orderNumber } : {}),
            outboundMode: 'delivery_proof_photo_ondemand',
            ...buildOutboundWamidMetadata(imageSend.messageId),
        });
    }

    console.info(
        `[delivery-photos-ondemand] OK order=${order.orderNumber || order.id} photos=${photosSent} window=${withinWindow ? 'open' : 'closed'} msg=${lastMessageId || '-'}`
    );

    return { ok: true, photosSent, orderId: order.id };
}
