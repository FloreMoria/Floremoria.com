/**
 * POST /api/dashboard/orders/[orderId]/link-chat-media
 * Collega una foto ricevuta in chat (WhatsApp/Telegram/Hub) a un ordine specifico,
 * creando/aggiornando DeliveryProof e propagando a cascata la foto su:
 * - Scheda Defunto (DeceasedProfile.deliveryPhotoUrls + cover)
 * - Registro Fiorista & Scheda Partner
 * - Giardino della Memoria & Bacheca Utente
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { propagateDeliveryPhotosToLinkedProfiles } from '@/lib/deliveryProof/injectOrderDeliveryPhotos';
import { uniqueAppendPhotoUrls } from '@/lib/deliveryProof/uniqueAppendPhotoUrls';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ orderId: string }> }
): Promise<NextResponse> {
    try {
        const { orderId } = await context.params;
        const cleanOrderId = orderId?.trim();

        if (!cleanOrderId) {
            return NextResponse.json({ ok: false, error: 'orderId mancante' }, { status: 400 });
        }

        const body = await request.json().catch(() => ({}));
        const mediaUrl = typeof body.mediaUrl === 'string' ? body.mediaUrl.trim() : '';
        const caption = typeof body.caption === 'string' ? body.caption.trim() : '';
        const takenAt = typeof body.takenAt === 'string' && body.takenAt ? new Date(body.takenAt) : new Date();
        const kind = body.kind === 'before' ? 'before' : 'after';

        if (!mediaUrl) {
            return NextResponse.json({ ok: false, error: 'Parametro mediaUrl obbligatorio.' }, { status: 400 });
        }

        const order = await prisma.order.findFirst({
            where: { id: cleanOrderId, deletedAt: null },
            include: {
                deliveryProof: true,
                deceasedProfile: true,
            },
        });

        if (!order) {
            return NextResponse.json({ ok: false, error: 'Ordine non trovato.' }, { status: 404 });
        }

        const partnerId = order.partnerId || 'mock-florist-id';

        // 1. Aggiorna o crea il record DeliveryProof
        let proof = order.deliveryProof;
        if (proof) {
            const existingBefore = proof.photosBeforeUrls || (proof.photoBeforeUrl ? [proof.photoBeforeUrl] : []);
            const existingAfter = proof.photosAfterUrls || (proof.photoAfterUrl ? [proof.photoAfterUrl] : []);

            const updatedBefore = kind === 'before' ? uniqueAppendPhotoUrls(existingBefore, [mediaUrl]) : existingBefore;
            const updatedAfter = kind === 'after' ? uniqueAppendPhotoUrls(existingAfter, [mediaUrl]) : existingAfter;

            proof = await prisma.deliveryProof.update({
                where: { id: proof.id },
                data: {
                    status: 'COMPLETED',
                    photoBeforeUrl: updatedBefore[0] || proof.photoBeforeUrl,
                    photoAfterUrl: updatedAfter[0] || proof.photoAfterUrl || mediaUrl,
                    photosBeforeUrls: updatedBefore,
                    photosAfterUrls: updatedAfter,
                    ...(kind === 'before' ? { timestampBefore: takenAt } : { timestampAfter: takenAt }),
                },
            });
        } else {
            proof = await prisma.deliveryProof.create({
                data: {
                    orderId: order.id,
                    partnerId,
                    userId: order.userId || null,
                    status: 'COMPLETED',
                    photoAfterUrl: kind === 'after' ? mediaUrl : null,
                    photoBeforeUrl: kind === 'before' ? mediaUrl : null,
                    photosAfterUrls: kind === 'after' ? [mediaUrl] : [],
                    photosBeforeUrls: kind === 'before' ? [mediaUrl] : [],
                    ...(kind === 'before' ? { timestampBefore: takenAt } : { timestampAfter: takenAt }),
                },
            });
        }

        // 2. Aggiorna lo stato dell'Ordine a COMPLETED e aggiungi la foto a Order.photos
        const updatedOrderPhotos = uniqueAppendPhotoUrls(order.photos || [], [mediaUrl]);
        const shouldCompleteOrder = order.status !== 'COMPLETED' && order.status !== 'CANCELLED';

        await prisma.order.update({
            where: { id: order.id },
            data: {
                photos: updatedOrderPhotos,
                ...(shouldCompleteOrder ? { status: 'COMPLETED' } : {}),
                ...(caption ? { additionalInstructions: [order.additionalInstructions, `[Foto chat]: ${caption}`].filter(Boolean).join(' | ') } : {}),
            },
        });

        // 3. Propaga a cascata su Scheda Defunto (DeceasedProfile.deliveryPhotoUrls e coverUrl)
        const propagateResult = await propagateDeliveryPhotosToLinkedProfiles(order.id, [mediaUrl]);

        // 4. Revalida le rotte interessate
        revalidatePath('/dashboard/orders');
        revalidatePath('/dashboard/defunti');
        revalidatePath('/dashboard/fioristi');
        revalidatePath('/dashboard/communications');
        revalidatePath('/bacheca');
        revalidatePath('/profile/orders');
        if (order.deceasedProfileId) {
            revalidatePath(`/giardino/${order.deceasedProfileId}`);
        }

        return NextResponse.json({
            ok: true,
            success: true,
            orderId: order.id,
            orderNumber: order.orderNumber,
            photoUrl: mediaUrl,
            status: 'COMPLETED',
            proofId: proof.id,
            deceasedProfileId: propagateResult.deceasedProfileId,
        });
    } catch (err) {
        console.error('[link-chat-media] Error linking media:', err);
        return NextResponse.json(
            { ok: false, error: err instanceof Error ? err.message : 'Errore salvataggio foto su ordine.' },
            { status: 500 }
        );
    }
}
