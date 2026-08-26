import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { retryPuntoAIfBlocked } from '@/lib/vera/orderWorkflow';
import { clearVeraOperationalAlert } from '@/lib/vera/operationalAlerts';
import { cancelDashboardOrder } from '@/lib/orders/cancelOrder';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { onOrderStatusChanged } from '@/lib/orders/orderStatusFilter';

export const maxDuration = 120;

export async function PUT(request: Request, context: any) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const { id } = await context.params;
        const body = await request.json();

        const previousOrder = await prisma.order.findUnique({
            where: { id },
            select: { status: true, partnerId: true, userId: true, gravePosition: true, veraAlertType: true },
        });

        // Filtra nel Body solo i campi utili omettendo chiavi non volute per maggiore sicurezza
        const safeData: any = {};
        
        const validKeys = [
            'partnerPaymentStatus', 'cemeteryName', 'cemeteryCity', 
            'gravePosition', 'deliveryDate', 'deceasedName', 
            'deceasedBirthDate', 'deceasedDeathDate', 'additionalInstructions', 'status',
            'buyerFullName', 'customerPhone', 'totalPriceCents',
        ];

        validKeys.forEach(k => {
            if (body[k] !== undefined) {
                // Parse date columns safely (handling ISO strings, IT formats, or empty strings/nulls)
                if (k === 'deceasedBirthDate' || k === 'deceasedDeathDate' || k === 'deliveryDate') {
                    if (body[k] === null || (typeof body[k] === 'string' && body[k].trim() === '')) {
                        safeData[k] = null;
                    } else if (body[k]) {
                        const parsedDate = new Date(body[k]);
                        if (isNaN(parsedDate.getTime())) {
                            safeData[k] = null;
                        } else {
                            safeData[k] = parsedDate;
                        }
                    }
                } else {
                    safeData[k] = body[k];
                }
            }
        });

        if (body.ticketMessage !== undefined) {
            const raw =
                typeof body.ticketMessage === 'string' ? body.ticketMessage.trim() : body.ticketMessage;
            safeData.ticketMessage = raw ? String(raw) : null;
        }

        // Gestione note / istruzioni aggiuntive (specialNotes nel frontend mappato su additionalInstructions nel DB)
        if (body.specialNotes !== undefined || body.additionalInstructions !== undefined) {
            let newNotes = body.specialNotes !== undefined ? body.specialNotes : body.additionalInstructions;
            
            // Protegge i metadati B2B Stripe da sovrascritture accidentali da parte del personale di backoffice
            try {
                const existingOrder = await prisma.order.findUnique({
                    where: { id },
                    select: { additionalInstructions: true }
                });
                if (existingOrder?.additionalInstructions && existingOrder.additionalInstructions.includes('---B2B_STRIPE_METADATA---')) {
                    const parts = existingOrder.additionalInstructions.split('---B2B_STRIPE_METADATA---');
                    const metadataBlock = parts[1];
                    newNotes = newNotes.trim() + `\n\n---B2B_STRIPE_METADATA---\n` + metadataBlock.trim();
                }
            } catch (err) {
                console.error('Error preserving B2B Stripe metadata:', err);
            }
            
            safeData.additionalInstructions = newNotes;
        }

        // Normalizzazione sicura del valore dello stato ordine rispetto all'enum Prisma
        if (body.status !== undefined) {
            let s = String(body.status).trim();
            if (s === 'WAITING') s = 'PENDING';
            if (s === 'PAID' || s === 'PAID_TO_DELIVER') s = 'ACCEPTED';
            if (s === 'GDM_PLANNED' || s === 'GDM_ANNIVERSARY') s = 'IN_PROGRESS';

            const validOrderStatuses = ['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'DELIVERING', 'COMPLETED', 'CANCELLED'];
            if (validOrderStatuses.includes(s)) {
                safeData.status = s;
            }
        }

        // Gestione relazioni annidate in Prisma per evitare l'errore P2025 in assenza di relazione precedente
        if (body.partnerId !== undefined) {
            if (body.partnerId && String(body.partnerId).trim()) {
                safeData.partner = { connect: { id: String(body.partnerId).trim() } };
            } else if (previousOrder?.partnerId) {
                safeData.partner = { disconnect: true };
            }
        }
        if (body.userId !== undefined) {
            if (body.userId && String(body.userId).trim()) {
                safeData.user = { connect: { id: String(body.userId).trim() } };
            } else if (previousOrder?.userId) {
                safeData.user = { disconnect: true };
            }
        }

        if (safeData.status === 'CANCELLED') {
            const cancelled = await cancelDashboardOrder(id);
            return NextResponse.json(cancelled);
        }

        let updatedOrder;
        try {
            updatedOrder = await prisma.order.update({
                where: { id },
                data: safeData
            });
        } catch (dbError: any) {
            console.error('[orders-put] Errore prisma.order.update:', dbError);
            return NextResponse.json(
                { error: 'Errore aggiornamento stato nel database', details: dbError?.message || String(dbError) },
                { status: 500 }
            );
        }

        const nextStatus = typeof safeData.status === 'string' ? safeData.status : previousOrder?.status;

        const partnerAssignedOrChanged =
            body.partnerId !== undefined && body.partnerId !== previousOrder?.partnerId;
        const statusChanged = nextStatus && nextStatus !== previousOrder?.status;

        // Scatena Punto A/B: await obbligatorio su Vercel (void veniva killato a fine response).
        if (statusChanged || partnerAssignedOrChanged) {
            try {
                await onOrderStatusChanged(id, nextStatus || 'IN_PROGRESS');
            } catch (err) {
                console.error('[orders-put] Errore chiamata onOrderStatusChanged:', err);
            }
        }

        const nextGrave =
            body.gravePosition !== undefined
                ? String(body.gravePosition || '').trim()
                : String(previousOrder?.gravePosition || '').trim();
        const graveJustFilled =
            body.gravePosition !== undefined &&
            Boolean(nextGrave) &&
            !String(previousOrder?.gravePosition || '').trim();
        const gravePresentWithStaleAlert =
            Boolean(nextGrave) &&
            (previousOrder?.veraAlertType === 'grave_position_missing' ||
                previousOrder?.veraAlertType === 'punto_a_send_failed');

        // Sblocca e reinizia Punto A se la posizione c'è (anche se era già compilata).
        if (graveJustFilled || gravePresentWithStaleAlert) {
            void clearVeraOperationalAlert(id)
                .then(() => retryPuntoAIfBlocked(id))
                .catch((err) => {
                    console.error('[orders-put] Retry Punto A dopo gravePosition fallito:', err);
                });
        }

        return NextResponse.json(updatedOrder);
    } catch (error: any) {
        console.error('Error updating order:', error);
        return NextResponse.json(
            { error: 'Errore aggiornamento stato nel database', details: error?.message || String(error) },
            { status: 500 }
        );
    }
}

export async function DELETE(_request: Request, context: any) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const { id } = await context.params;
        const cancelled = await cancelDashboardOrder(id);
        return NextResponse.json({ ok: true, order: cancelled });
    } catch (error) {
        console.error('Error deleting order:', error);
        return NextResponse.json({ ok: false, error: 'Failed to delete order' }, { status: 500 });
    }
}
