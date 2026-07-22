/**
 * Recovery urgente FT-MB-26-001 — Carolina non vedeva le foto (WebP + eventuale Blob non fetchabile da Meta).
 * Esegui: npx tsx scratch/recover-ft-mb-26-001-photos.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import prisma from '../lib/prisma';
import { ensureUserForOrder } from '../lib/auth/ensureOrderUser';
import { syncDeceasedRelationsForOrder } from '../lib/deceased/syncDeceasedRelations';
import { injectDeliveryPhotosOnOrder } from '../lib/deliveryProof/injectOrderDeliveryPhotos';
import { processProofImageBuffer } from '../lib/deliveryProof/processProofImage';
import { triggerSocialSanitizationForOrder } from '../lib/deliveryProof/triggerSocialSanitization';
import { addMessage, setSessionStatus, updateSessionProfile } from '../lib/chatStore';
import { buildProofFotoAccessUrl } from '../lib/auth/proofFotoAccess';
import {
    renderDeliveryProofCaption,
    renderGiardinoDellaMemoriaLinkMessage,
    resolvePartnerCity,
} from '../lib/whatsapp/deliveryProofCopy';
import { ensureWhatsAppImageUrlFromBuffer } from '../lib/whatsapp/deliveryImageStaging';
import {
    normalizePhoneE164,
    sendWhatsAppImageMessage,
    sendWhatsAppTextMessage,
} from '../lib/whatsapp/metaCloudApiClient';
import { buildContactInitials } from '../lib/whatsapp/sessionPhone';

const ORDER_NUMBER = 'FT-MB-26-001';
const CUSTOMER_PHONE = '+393312134719';

async function main() {
    const order = await prisma.order.findFirst({
        where: { orderNumber: ORDER_NUMBER, deletedAt: null },
        include: {
            partner: true,
            items: { include: { product: true } },
            deliveryProof: true,
            deceasedProfile: true,
            user: { select: { id: true, email: true, name: true } },
        },
    });
    if (!order) throw new Error(`Ordine ${ORDER_NUMBER} non trovato`);

    // Solo le foto già inoltrate/caricate verso Carolina (URL pubblici storici).
    const customerOutbound = await prisma.whatsAppChatMessage.findMany({
        where: {
            session: { phone: { contains: '3312134719' } },
            direction: 'OUTBOUND',
            mediaUrl: { contains: 'public.blob.vercel-storage.com' },
            createdAt: { gte: new Date('2026-07-22T12:00:00Z') },
        },
        orderBy: { createdAt: 'asc' },
        select: { mediaUrl: true },
    });

    const uniqueUrls = [...new Set(customerOutbound.map((m) => m.mediaUrl!).filter(Boolean))];
    if (!uniqueUrls.length) throw new Error('Nessuna foto pubblica trovata in chat Carolina.');

    console.log(`Foto sorgente: ${uniqueUrls.length}`);

    const buffers: Buffer[] = [];
    for (const url of uniqueUrls) {
        const res = await fetch(url);
        if (!res.ok) {
            console.warn('Skip', url, res.status);
            continue;
        }
        buffers.push(Buffer.from(await res.arrayBuffer()));
    }
    if (!buffers.length) throw new Error('Download foto fallito.');

    // Usa max 4 foto distinte (inoltro + re-upload avevano duplicati).
    const selected = buffers.slice(0, 4);

    const photosAfterUrls: string[] = [];
    for (const buf of selected) {
        photosAfterUrls.push(await processProofImageBuffer(buf, order));
    }
    const photosBeforeUrls = [photosAfterUrls[0]!];
    const now = new Date();

    await prisma.$transaction(async (tx) => {
        await tx.deliveryProof.upsert({
            where: { orderId: order.id },
            update: {
                partnerId: order.partnerId!,
                photosBeforeUrls,
                photosAfterUrls,
                photoBeforeUrl: photosBeforeUrls[0] ?? null,
                photoAfterUrl: photosAfterUrls[0]!,
                timestampAfter: now,
                timestampBefore: now,
                status: 'COMPLETED',
            },
            create: {
                orderId: order.id,
                partnerId: order.partnerId!,
                photosBeforeUrls,
                photosAfterUrls,
                photoBeforeUrl: photosBeforeUrls[0] ?? null,
                photoAfterUrl: photosAfterUrls[0]!,
                timestampBefore: now,
                timestampAfter: now,
                status: 'COMPLETED',
            },
        });
        await injectDeliveryPhotosOnOrder(tx, order.id, photosBeforeUrls, photosAfterUrls);
        await tx.order.update({
            where: { id: order.id },
            data: { status: 'DELIVERING' },
        });
    });

    const fullOrder = await prisma.order.findFirst({
        where: { id: order.id },
        include: {
            partner: true,
            items: { include: { product: true } },
            deliveryProof: true,
            deceasedProfile: true,
            user: { select: { id: true, email: true, name: true } },
        },
    });
    if (fullOrder) {
        const linkedUser = await ensureUserForOrder(fullOrder);
        if (linkedUser) {
            await prisma.deliveryProof.update({
                where: { orderId: order.id },
                data: { userId: linkedUser.id },
            });
        }
        await syncDeceasedRelationsForOrder(order.id);
        void triggerSocialSanitizationForOrder(order.id, photosAfterUrls);
    }

    const phoneE164 = normalizePhoneE164(CUSTOMER_PHONE)!;
    const sessionPhone = `whatsapp:${phoneE164}`;
    const partnerCity = resolvePartnerCity(order);
    const caption =
        `Buongiorno Carolina, con immensa gioia Le confermiamo che i fiori nel ricordo di ${order.deceasedName || 'Elio Bertelli'} ` +
        `sono stati posati dal nostro partner di ${partnerCity}. In allegato la foto della consegna 🌹`;

    for (let i = 0; i < selected.length; i += 1) {
        const metaUrl = await ensureWhatsAppImageUrlFromBuffer(
            `${order.id}-recover-${i}`,
            selected[i]!
        );
        console.log(`Staging Meta ${i + 1}:`, metaUrl.slice(0, 80), '...');
        const send = await sendWhatsAppImageMessage(
            phoneE164,
            metaUrl,
            i === 0 ? caption : undefined
        );
        console.log(`Send photo ${i + 1}:`, send);
        if (!send.ok) throw new Error(`Invio foto ${i + 1} fallito: ${send.error}`);

        await addMessage(sessionPhone, 'OUTBOUND', i === 0 ? caption : 'Foto consegna', photosAfterUrls[i], {
            source: 'operator',
            outboundMode: 'photo',
            recovery: 'ft-mb-26-001-jpeg-staging',
            ...(send.messageId ? { whatsAppMessageId: send.messageId } : {}),
        });
        await new Promise((r) => setTimeout(r, 900));
    }

    const giardinoUrl = await buildProofFotoAccessUrl(order.id, order.orderNumber);
    const linkText = renderGiardinoDellaMemoriaLinkMessage(giardinoUrl);
    const linkSend = await sendWhatsAppTextMessage(phoneE164, linkText);
    console.log('Send link:', linkSend);
    if (linkSend.ok) {
        await addMessage(sessionPhone, 'OUTBOUND', linkText, undefined, {
            source: 'operator',
            outboundMode: 'freetext',
            recovery: 'ft-mb-26-001-jpeg-staging',
            ...(linkSend.messageId ? { whatsAppMessageId: linkSend.messageId } : {}),
        });
    }

    await updateSessionProfile(sessionPhone, {
        name: 'Carolina Negrini Bertelli',
        initials: buildContactInitials('Carolina Negrini Bertelli'),
        userType: 'UTENTE',
        status: 'HUMAN_INTERVENTION',
        welcomeSent: true,
    });
    await setSessionStatus(sessionPhone, 'HUMAN_INTERVENTION');

    console.log('\nRecovery completato per Carolina.');
    console.log('Giardino:', giardinoUrl);
    console.log('Foto registrate:', photosAfterUrls.length);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
