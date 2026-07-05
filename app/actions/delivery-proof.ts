    "use server";

    import prisma from '@/lib/prisma';
    import { syncOrderPhotosArray } from '@/lib/deliveryProof/proofPhotoUrls';
    import { notifyCustomerDeliveryComplete } from '@/lib/deliveryProof/notifyCustomerDeliveryComplete';
    import { ensureUserForOrder } from '@/lib/auth/ensureOrderUser';
    import { revalidatePath } from 'next/cache';
    import { processProofImageFile } from '@/lib/deliveryProof/processProofImage';
    import { triggerSocialSanitizationForOrder } from '@/lib/deliveryProof/triggerSocialSanitization';

    export async function submitDeliveryProof(formData: FormData) {
        try {
            const orderIdentifier = formData.get('orderIdentifier') as string;
            if (!orderIdentifier) {
                return { success: false, error: 'Codice ordine o ID mancante (es. FF-001).' };
            }

            // Ricerca Ordine per ID interno oppure identificativo WhatsApp (orderNumber)
            const order = await prisma.order.findFirst({
                where: {
                    OR: [
                        { orderNumber: orderIdentifier },
                        { id: orderIdentifier }
                    ]
                },
                include: {
                    partner: true,
                    user: { select: { email: true, name: true } },
                    items: {
                        include: {
                            product: true
                        }
                    }
                }
            });

            if (!order) {
                return { success: false, error: `Nessun ordine trovato con questo identificativo: ${orderIdentifier}` };
            }

            const partnerId = order.partnerId || 'partner-sistema-interno';

            // Coordinate GPS
            const latStr = formData.get('gpsLatitude') as string | null;
            const lngStr = formData.get('gpsLongitude') as string | null;
            const gpsLatitude = latStr ? parseFloat(latStr) : null;
            const gpsLongitude = lngStr ? parseFloat(lngStr) : null;

            // Recupero file
            const photoBefore = formData.get('photoBefore') as File | null;
            const photoAfter = formData.get('photoAfter') as File | null;

            let photoBeforeUrl: string | null = null;
            let photoAfterUrl: string | null = null;

            // Processing via Sharp + Vercel Blob
            if (photoBefore && photoBefore.size > 0) {
                photoBeforeUrl = await processProofImageFile(photoBefore, 'before', order, 0);
            }
            if (photoAfter && photoAfter.size > 0) {
                photoAfterUrl = await processProofImageFile(photoAfter, 'after', order, 0);
            }

            let newStatus: 'PENDING' | 'BEFORE_UPLOADED' | 'COMPLETED' = 'PENDING';
            if (photoBeforeUrl && photoAfterUrl) {
                newStatus = 'COMPLETED';
            } else if (photoBeforeUrl || photoAfterUrl) {
                newStatus = 'BEFORE_UPLOADED';
            }

            const deliveryProof = await prisma.deliveryProof.upsert({
                where: { orderId: order.id },
                update: {
                    ...(photoBeforeUrl && {
                        photoBeforeUrl,
                        photosBeforeUrls: [photoBeforeUrl],
                        timestampBefore: new Date(),
                    }),
                    ...(photoAfterUrl && {
                        photoAfterUrl,
                        photosAfterUrls: [photoAfterUrl],
                        timestampAfter: new Date(),
                    }),
                    ...(gpsLatitude !== null && { gpsLatitude }),
                    ...(gpsLongitude !== null && { gpsLongitude }),
                    status: newStatus
                },
                create: {
                    orderId: order.id,
                    partnerId: partnerId,
                    photoBeforeUrl: photoBeforeUrl || null,
                    photoAfterUrl: photoAfterUrl || null,
                    photosBeforeUrls: photoBeforeUrl ? [photoBeforeUrl] : [],
                    photosAfterUrls: photoAfterUrl ? [photoAfterUrl] : [],
                    timestampBefore: photoBeforeUrl ? new Date() : null,
                    timestampAfter: photoAfterUrl ? new Date() : null,
                    gpsLatitude: gpsLatitude,
                    gpsLongitude: gpsLongitude,
                    status: newStatus
                }
            });

            // Sincronizzazione status ordine principale se completo + iniezione foto su Order
            if (newStatus === 'COMPLETED' && order.status !== 'COMPLETED') {
                const photosBefore = photoBeforeUrl ? [photoBeforeUrl] : [];
                const photosAfter = photoAfterUrl ? [photoAfterUrl] : [];
                await prisma.order.update({
                    where: { id: order.id },
                    data: {
                        status: 'COMPLETED',
                        photos: syncOrderPhotosArray(photosBefore, photosAfter),
                    },
                });
            }

            if (newStatus === 'COMPLETED' && photoAfterUrl) {
                void triggerSocialSanitizationForOrder(order.id, [photoAfterUrl]);
                await ensureUserForOrder(order);
                void notifyCustomerDeliveryComplete(order.id).catch((err) => {
                    console.error('[delivery-proof] Notifica VERA post-consegna non riuscita (non bloccante):', err);
                });
            }

            revalidatePath('/dashboard');
            revalidatePath(`/dashboard/orders/${order.id}`);
            
            return { success: true, deliveryProof };

        } catch (error: any) {
            console.error("Double Witnessing upload error:", error);
            return { 
                success: false, 
                error: error?.message || 'Errore critico durante il salvataggio dei ricordi del Giardino della Memoria' 
            };
        }
    }
