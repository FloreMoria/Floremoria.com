import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { deleteProofBlob, fetchProofImageBuffer, overwriteProofBlob } from '@/lib/deliveryProof/blobProofStorage';
import { normalizeProofImageBuffer } from '@/lib/deliveryProof/imagePipeline';
import { processProofImageFile } from '@/lib/deliveryProof/processProofImage';
import {
    syncOrderPhotosArray,
    type ProofPhotoSlot,
} from '@/lib/deliveryProof/proofPhotoUrls';
import { triggerSocialSanitizationForOrder } from '@/lib/deliveryProof/triggerSocialSanitization';
import { propagateDeliveryPhotosToLinkedProfiles } from '@/lib/deliveryProof/injectOrderDeliveryPhotos';

type ProofArrays = {
    photosBeforeUrls: string[];
    photosAfterUrls: string[];
    photoBeforeUrl: string | null;
    photoAfterUrl: string | null;
};

function getSlotUrls(arrays: ProofArrays, slot: ProofPhotoSlot): string[] {
    if (slot === 'before') {
        if (arrays.photosBeforeUrls.length > 0) return arrays.photosBeforeUrls;
        return arrays.photoBeforeUrl ? [arrays.photoBeforeUrl] : [];
    }
    if (arrays.photosAfterUrls.length > 0) return arrays.photosAfterUrls;
    return arrays.photoAfterUrl ? [arrays.photoAfterUrl] : [];
}

function setSlotUrls(arrays: ProofArrays, slot: ProofPhotoSlot, urls: string[]): ProofArrays {
    if (slot === 'before') {
        return {
            ...arrays,
            photosBeforeUrls: urls,
            photoBeforeUrl: urls[0] ?? null,
        };
    }
    return {
        ...arrays,
        photosAfterUrls: urls,
        photoAfterUrl: urls[0] ?? null,
    };
}

function findPhotoInProof(proof: ProofArrays, url: string): { slot: ProofPhotoSlot; index: number } | null {
    const beforeIdx = proof.photosBeforeUrls.indexOf(url);
    if (beforeIdx >= 0) return { slot: 'before', index: beforeIdx };
    if (proof.photoBeforeUrl === url) return { slot: 'before', index: 0 };

    const afterIdx = proof.photosAfterUrls.indexOf(url);
    if (afterIdx >= 0) return { slot: 'after', index: afterIdx };
    if (proof.photoAfterUrl === url) return { slot: 'after', index: 0 };

    return null;
}

async function persistProofUpdate(
    orderId: string,
    orderNumber: string | null,
    proofId: string,
    arrays: ProofArrays
) {
    const flatPhotos = syncOrderPhotosArray(arrays.photosBeforeUrls, arrays.photosAfterUrls);
    const hasAnyPhoto = flatPhotos.length > 0;

    // Merge con Order.photos esistenti: non sovrascrivere lo storico con solo lo slot corrente.
    const existingOrder = await prisma.order.findUnique({
        where: { id: orderId },
        select: { photos: true },
    });
    const mergedPhotos = [
        ...new Set([...(existingOrder?.photos || []), ...flatPhotos].map((u) => u.trim()).filter(Boolean)),
    ];

    await prisma.$transaction([
        prisma.deliveryProof.update({
            where: { id: proofId },
            data: {
                photosBeforeUrls: arrays.photosBeforeUrls,
                photosAfterUrls: arrays.photosAfterUrls,
                photoBeforeUrl: arrays.photoBeforeUrl,
                photoAfterUrl: arrays.photoAfterUrl,
                status: hasAnyPhoto ? 'COMPLETED' : 'PENDING',
            },
        }),
        prisma.order.update({
            where: { id: orderId },
            data: { photos: mergedPhotos.length > 0 ? mergedPhotos : flatPhotos },
        }),
    ]);

    // Propaga galleria defunto/GdM senza re-trigger WhatsApp (gestito da submit/link-chat).
    if (arrays.photosAfterUrls.length > 0) {
        try {
            await propagateDeliveryPhotosToLinkedProfiles(orderId, arrays.photosAfterUrls);
        } catch (err) {
            console.error('[persistProofUpdate] Propagazione GdM fallita (non bloccante):', err);
        }
    }

    revalidatePath('/dashboard/user');
    revalidatePath('/dashboard/users');
    revalidatePath('/dashboard/orders');
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/defunti');
    revalidatePath(`/fiorista/consegna/${orderId}`);
    if (orderNumber) {
        revalidatePath(`/fiorista/consegna/${orderNumber}`);
    }
}

export async function rotateProofPhoto(orderId: string, url: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
    const order = await prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        include: { deliveryProof: true },
    });

    if (!order?.deliveryProof) {
        return { ok: false, error: 'Prova di consegna non trovata.' };
    }

    const located = findPhotoInProof(order.deliveryProof, url);
    if (!located) {
        return { ok: false, error: 'Foto non associata a questo ordine.' };
    }

    try {
        const buffer = await fetchProofImageBuffer(url);
        const rotated = await normalizeProofImageBuffer(buffer, 90);
        const newUrl = await overwriteProofBlob(url, rotated);

        let arrays: ProofArrays = {
            photosBeforeUrls: [...order.deliveryProof.photosBeforeUrls],
            photosAfterUrls: [...order.deliveryProof.photosAfterUrls],
            photoBeforeUrl: order.deliveryProof.photoBeforeUrl,
            photoAfterUrl: order.deliveryProof.photoAfterUrl,
        };

        const slotUrls = [...getSlotUrls(arrays, located.slot)];
        slotUrls[located.index] = newUrl;
        arrays = setSlotUrls(arrays, located.slot, slotUrls);

        await persistProofUpdate(order.id, order.orderNumber, order.deliveryProof.id, arrays);
        return { ok: true, url: `${newUrl}?v=${Date.now()}` };
    } catch (err) {
        console.error('[rotateProofPhoto]', err);
        return { ok: false, error: err instanceof Error ? err.message : 'Rotazione non riuscita.' };
    }
}

export async function replaceProofPhoto(
    orderId: string,
    url: string,
    file: File
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
    const order = await prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        include: { deliveryProof: true, deceasedProfile: true },
    });

    if (!order?.deliveryProof) {
        return { ok: false, error: 'Prova di consegna non trovata.' };
    }

    const located = findPhotoInProof(order.deliveryProof, url);
    if (!located) {
        return { ok: false, error: 'Foto non associata a questo ordine.' };
    }

    try {
        const processed = await normalizeProofImageBuffer(Buffer.from(await file.arrayBuffer()));
        const newUrl = await overwriteProofBlob(url, processed);

        let arrays: ProofArrays = {
            photosBeforeUrls: [...order.deliveryProof.photosBeforeUrls],
            photosAfterUrls: [...order.deliveryProof.photosAfterUrls],
            photoBeforeUrl: order.deliveryProof.photoBeforeUrl,
            photoAfterUrl: order.deliveryProof.photoAfterUrl,
        };

        const slotUrls = [...getSlotUrls(arrays, located.slot)];
        slotUrls[located.index] = newUrl;
        arrays = setSlotUrls(arrays, located.slot, slotUrls);

        await persistProofUpdate(order.id, order.orderNumber, order.deliveryProof.id, arrays);

        if (located.slot === 'after') {
            void triggerSocialSanitizationForOrder(order.id, arrays.photosAfterUrls);
        }

        return { ok: true, url: `${newUrl}?v=${Date.now()}` };
    } catch (err) {
        console.error('[replaceProofPhoto]', err);
        return { ok: false, error: err instanceof Error ? err.message : 'Sostituzione non riuscita.' };
    }
}

export async function deleteProofPhoto(
    orderId: string,
    url: string
): Promise<{ ok: true } | { ok: false; error: string }> {
    const order = await prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        include: { deliveryProof: true },
    });

    if (!order?.deliveryProof) {
        return { ok: false, error: 'Prova di consegna non trovata.' };
    }

    const located = findPhotoInProof(order.deliveryProof, url);
    if (!located) {
        return { ok: false, error: 'Foto non associata a questo ordine.' };
    }

    try {
        await deleteProofBlob(url);
    } catch (err) {
        console.warn('[deleteProofPhoto] Blob delete skipped:', err);
    }

    let arrays: ProofArrays = {
        photosBeforeUrls: [...order.deliveryProof.photosBeforeUrls],
        photosAfterUrls: [...order.deliveryProof.photosAfterUrls],
        photoBeforeUrl: order.deliveryProof.photoBeforeUrl,
        photoAfterUrl: order.deliveryProof.photoAfterUrl,
    };

    const slotUrls = getSlotUrls(arrays, located.slot).filter((u) => u !== url);
    arrays = setSlotUrls(arrays, located.slot, slotUrls);

    await persistProofUpdate(order.id, order.orderNumber, order.deliveryProof.id, arrays);
    return { ok: true };
}

/** Carica una foto su slot prima/dopo (dashboard admin). Sostituisce la foto esistente nello slot. */
export async function uploadProofPhoto(
    orderId: string,
    slot: ProofPhotoSlot,
    file: File
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
    const order = await prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        include: {
            deliveryProof: true,
            deceasedProfile: true,
        },
    });

    if (!order) {
        return { ok: false, error: 'Ordine non trovato.' };
    }
    if (!order.partnerId) {
        return { ok: false, error: 'Assegna un fiorista all\'ordine prima di caricare le foto.' };
    }

    try {
        const newUrl = await processProofImageFile(file, slot, order, 0);

        let proof = order.deliveryProof;
        if (!proof) {
            proof = await prisma.deliveryProof.create({
                data: {
                    orderId: order.id,
                    partnerId: order.partnerId,
                    status: 'PENDING',
                },
            });
        }

        let arrays: ProofArrays = {
            photosBeforeUrls: [...proof.photosBeforeUrls],
            photosAfterUrls: [...proof.photosAfterUrls],
            photoBeforeUrl: proof.photoBeforeUrl,
            photoAfterUrl: proof.photoAfterUrl,
        };

        const existingUrls = getSlotUrls(arrays, slot);
        // Aggiungiamo la nuova foto all'array esistente senza sovrascrivere o eliminare i file storici
        const updatedUrls = existingUrls.includes(newUrl) ? existingUrls : [...existingUrls, newUrl];

        arrays = setSlotUrls(arrays, slot, updatedUrls);
        await persistProofUpdate(order.id, order.orderNumber, proof.id, arrays);

        if (slot === 'after') {
            void triggerSocialSanitizationForOrder(order.id, arrays.photosAfterUrls);
        }

        return { ok: true, url: `${newUrl}?v=${Date.now()}` };

    } catch (err) {
        console.error('[uploadProofPhoto]', err);
        return { ok: false, error: err instanceof Error ? err.message : 'Caricamento non riuscito.' };
    }
}

/** Crea deliveryProof vuoto se manca, per upload admin su ordini senza proof. */
export async function ensureDeliveryProofRecord(orderId: string) {
    const order = await prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        select: { id: true, partnerId: true, deliveryProof: { select: { id: true } } },
    });
    if (!order?.partnerId || order.deliveryProof) return;
    await prisma.deliveryProof.create({
        data: {
            orderId: order.id,
            partnerId: order.partnerId,
            status: 'PENDING',
        },
    });
}

export { getOrderProofPhotos } from '@/lib/deliveryProof/proofPhotoUrls';