import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isFuturiaConfigured, syncFloristPartnerToFuturia } from '@/lib/futuria/client';
import { shouldNotifyFloristDeliveryLinkOnOrderUpdate } from '@/lib/futuria/floristDeliveryLinkNotify';
import { notifyFloristDeliveryLinkForOrder } from '@/lib/orders/notifyFloristDeliveryLink';
import { retryPuntoAIfBlocked } from '@/lib/vera/orderWorkflow';
import { clearVeraOperationalAlert } from '@/lib/vera/operationalAlerts';
import { cancelDashboardOrder } from '@/lib/orders/cancelOrder';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';

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
                // Parse se sono date ISO native inviate via HTTP JSON come stringhe
                if ((k === 'deceasedBirthDate' || k === 'deceasedDeathDate' || k === 'deliveryDate') && body[k]) {
                    safeData[k] = new Date(body[k]);
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
        const nextPartnerId =
            body.partnerId !== undefined ? (body.partnerId || null) : previousOrder?.partnerId ?? null;

        if (
            shouldNotifyFloristDeliveryLinkOnOrderUpdate(
                { status: previousOrder?.status, partnerId: previousOrder?.partnerId },
                { status: nextStatus, partnerId: nextPartnerId }
            )
        ) {
            void notifyFloristDeliveryLinkForOrder(id).catch((err) => {
                console.error('[orders-put] Invio link consegna fiorista fallito (non bloccante):', err);
            });
        }

        const graveFilled =
            body.gravePosition !== undefined &&
            String(body.gravePosition || '').trim() &&
            !String(previousOrder?.gravePosition || '').trim();

        if (
            graveFilled &&
            previousOrder?.veraAlertType === 'grave_position_missing'
        ) {
            void clearVeraOperationalAlert(id)
                .then(() => retryPuntoAIfBlocked(id))
                .catch((err) => {
                    console.error('[orders-put] Retry Punto A dopo gravePosition fallito:', err);
                });
        }

        if (body.partnerId && isFuturiaConfigured()) {
            // Esegui in background senza bloccare la risposta HTTP
            (async () => {
                try {
                    const partner = await prisma.partner.findUnique({
                        where: { id: body.partnerId }
                    });
                    const orderWithItems = await prisma.order.findUnique({
                        where: { id },
                        include: { items: { include: { product: true } } }
                    });
                    if (partner && orderWithItems && partner.whatsappNumber) {
                        await syncFloristPartnerToFuturia({
                            shopName: partner.shopName,
                            ownerName: partner.ownerName,
                            whatsappNumber: partner.whatsappNumber,
                            email: partner.email,
                            pecAddress: partner.pecAddress,
                            order: orderWithItems
                        });
                    }
                } catch (err) {
                    console.error('[orders-put] Error syncing florist to Futuria:', err);
                }
            })();
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
