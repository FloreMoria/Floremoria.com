import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function PUT(request: Request, context: any) {
    try {
        const { id } = await context.params;
        const body = await request.json();

        // Filtra nel Body solo i campi utili omettendo chiavi non volute per maggiore sicurezza
        const safeData: any = {};
        
        const validKeys = [
            'partnerPaymentStatus', 'cemeteryName', 'cemeteryCity', 
            'gravePosition', 'deliveryDate', 'deceasedName', 
            'deceasedBirthDate', 'deceasedDeathDate', 'additionalInstructions', 'status'
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
        if (body.specialNotes !== undefined) {
            safeData.additionalInstructions = body.specialNotes;
        }

        // Gestione relazioni annidate in Prisma per evitare l'errore ReadOnly di partnerId/userId
        if (body.partnerId !== undefined) {
            safeData.partner = body.partnerId ? { connect: { id: body.partnerId } } : { disconnect: true };
        }
        if (body.userId !== undefined) {
            safeData.user = body.userId ? { connect: { id: body.userId } } : { disconnect: true };
        }

        const updatedOrder = await prisma.order.update({
            where: { id },
            data: safeData
        });

        return NextResponse.json(updatedOrder);
    } catch (error) {
        console.error('Error updating order:', error);
        return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
    }
}
