import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { retryPuntoAIfBlocked } from '@/lib/vera/orderWorkflow';
import { clearVeraOperationalAlert } from '@/lib/vera/operationalAlerts';
import { cancelDashboardOrder } from '@/lib/orders/cancelOrder';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { onOrderStatusChanged } from '@/lib/orders/orderStatusFilter';

export async function PUT(request: Request, context: any) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const { id } = await context.params;
        const body = await request.json();

        const previousOrder = await prisma.order.findUnique({
            where: { id },
            select: { status: true, partnerId: true, gravePosition: true, veraAlertType: true },
        });

        // Filtra nel Body solo i campi utili omettendo chiavi non volute per maggiore sicurezza
        const safeData: any = {};
        
        const validKeys = [
            'partnerPaymentStatus', 'cemeteryName', 'cemeteryCity', 
            'gravePosition', 'deliveryDate', 'deceasedName', 
            'deceasedBirthDate', 'deceasedDeathDate', 'additionalInstructions', 'status',
            'buyerFullName', 'customerPhone', 'totalPriceCents'
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

        // Gestione relazioni annidate in Prisma per evitare l'errore ReadOnly di partnerId/userId
        if (body.partnerId !== undefined) {
            safeData.partner = body.partnerId ? { connect: { id: body.partnerId } } : { disconnect: true };
        }
        if (body.userId !== undefined) {
            safeData.user = body.userId ? { connect: { id: body.userId } } : { disconnect: true };
        }

        if (body.status === 'CANCELLED') {
            const cancelled = await cancelDashboardOrder(id);
            return NextResponse.json(cancelled);
        }

        const updatedOrder = await prisma.order.update({
            where: { id },
            data: safeData
        });

        const nextStatus = typeof safeData.status === 'string' ? safeData.status : previousOrder?.status;

        const partnerAssignedOrChanged =
            body.partnerId !== undefined && body.partnerId !== previousOrder?.partnerId;
        const statusChanged = nextStatus && nextStatus !== previousOrder?.status;

        // Scatena notifiche fiorista (Punto A) e cliente (Punto B) al cambio stato o assegnazione fiorista
        if (statusChanged || partnerAssignedOrChanged || updatedOrder.partnerId) {
            void onOrderStatusChanged(id, nextStatus || 'IN_PROGRESS').catch((err) => {
                console.error('[orders-put] Errore chiamata onOrderStatusChanged:', err);
            });
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
    } catch (error) {
        console.error('Error updating order:', error);
        return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
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
