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
import { onOrderStatusChanged } from '@/lib/orders/orderStatusFilter';
import { assertNotFiscalMediaForDelivery } from '@/lib/financial/fiscalMediaGuard';

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
            return NextResponse.json({ ok: false, error: 'Parametro orderId mancante.' }, { status: 400 });
        }

        const body = await request.json().catch(() => ({}));
        const mediaUrl = typeof body.mediaUrl === 'string' ? body.mediaUrl.trim() : '';
        const caption = typeof body.caption === 'string' ? body.caption.trim() : '';
        const takenAt = typeof body.takenAt === 'string' && body.takenAt ? new Date(body.takenAt) : new Date();
        const kind = body.kind === 'before' ? 'before' : 'after';

        if (!mediaUrl) {
            return NextResponse.json({ ok: false, error: 'Parametro mediaUrl obbligatorio.' }, { status: 400 });
        }

        try {
            assertNotFiscalMediaForDelivery(mediaUrl);
        } catch (guardErr) {
            return NextResponse.json(
                { ok: false, error: guardErr instanceof Error ? guardErr.message : 'Media fiscale non ammesso' },
                { status: 400 }
            );
        }

        // 1. Cerca l'ordine sia per ID Prisma (cuid/uuid) sia per codice ordine (es. FT-CO-26-001)
        const order = await prisma.order.findFirst({
            where: {
                OR: [
                    { id: cleanOrderId },
                    { orderNumber: cleanOrderId },
                ],
                deletedAt: null,
            },
            include: {
                deliveryProof: true,
                deceasedProfile: true,
            },
        });

        if (!order) {
            return NextResponse.json(
                { ok: false, error: `Ordine non trovato per ID/Codice: "${cleanOrderId}".` },
                { status: 404 }
            );
        }

        // 2. Determina un partnerId valido per rispettare il vincolo FK della tabella DeliveryProof
        let partnerId = order.partnerId;
        if (!partnerId) {
            const defaultPartner = await prisma.partner.findFirst({
                where: { deletedAt: null },
                select: { id: true },
            });
            partnerId = defaultPartner?.id || null;
        }

        if (!partnerId) {
            const existingAnyPartner = await prisma.partner.findFirst({
                select: { id: true },
            });
            if (existingAnyPartner) {
                partnerId = existingAnyPartner.id;
            } else {
                const createdSystemPartner = await prisma.partner.create({
                    data: {
                        ownerName: 'Fiorista di Sistema',
                        shopName: 'FloreMoria Partner',
                        email: 'sistema@floremoria.com',
                        address: 'Via FloreMoria 1',
                    },
                    select: { id: true },
                });
                partnerId = createdSystemPartner.id;
            }
        }


        // 3. Upsert atomico del record DeliveryProof
        const existingBefore = order.deliveryProof?.photosBeforeUrls || (order.deliveryProof?.photoBeforeUrl ? [order.deliveryProof.photoBeforeUrl] : []);
        const existingAfter = order.deliveryProof?.photosAfterUrls || (order.deliveryProof?.photoAfterUrl ? [order.deliveryProof.photoAfterUrl] : []);

        const updatedBefore = kind === 'before' ? uniqueAppendPhotoUrls(existingBefore, [mediaUrl]) : existingBefore;
        const updatedAfter = kind === 'after' ? uniqueAppendPhotoUrls(existingAfter, [mediaUrl]) : existingAfter;

        const proof = await prisma.deliveryProof.upsert({
            where: { orderId: order.id },
            create: {
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
            update: {
                partnerId,
                status: 'COMPLETED',
                photoBeforeUrl: updatedBefore[0] || order.deliveryProof?.photoBeforeUrl || null,
                photoAfterUrl: updatedAfter[0] || order.deliveryProof?.photoAfterUrl || mediaUrl,
                photosBeforeUrls: updatedBefore,
                photosAfterUrls: updatedAfter,
                ...(kind === 'before' ? { timestampBefore: takenAt } : { timestampAfter: takenAt }),
            },
        });

        // 4. Aggiorna l'Ordine (Order.photos e stato COMPLETED se non annullato)
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

        // 5. Propaga a cascata su Scheda Defunto (se collegato)
        const propagateResult = await propagateDeliveryPhotosToLinkedProfiles(order.id, [mediaUrl]);

        // 5b. Notifica WhatsApp VERA al cliente con template Meta floremoria_consegna_foto_utente
        try {
            await onOrderStatusChanged(order.id, 'COMPLETED');
            console.info('[link-chat-media] Notifica WhatsApp floremoria_consegna_foto_utente inviata per ordine:', order.id);
        } catch (notifyErr) {
            console.error('[link-chat-media] Errore non bloccante invio notifica WhatsApp post-consegna:', notifyErr);
        }

        // 6. Revalida le viste della Dashboard e Bacheca Utente
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
        const errorMsg = err instanceof Error ? err.message : 'Errore sconosciuto durante l\'associazione della foto.';
        console.error('[link-chat-media] Error linking media:', err);
        return NextResponse.json(
            { ok: false, success: false, error: errorMsg },
            { status: 500 }
        );
    }
}
