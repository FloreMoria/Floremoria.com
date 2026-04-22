'use server';

import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function updateGraveNotes(userId: string, notes: string) {
    try {
        if (!notes) {
            return { success: false, message: 'Le note non possono essere vuote.' };
        }

        // Inseriamo o aggiorniamo i dettagli relativi al cimitero per le future consegne.
        // Salvo nel record utente principale. Essendo un solo utente, potremmo usare un modello Notes o un campo in User.
        // Visto che abbiamo aggiunto una richiesta di indicazioni libere nel protocollo Fluido precedente,
        // potremmo salvare questo testo come nota interna nell'ultimo ordine, oppure direttamente sull'utente.
        
        // Essendo un Giardino della Memoria, queste note sono per il fiorista. Salviamo sul DB.
        // Se non abbiamo un campo dedicato, usiamo una logica di accodamento nell'ultimo ordine o usiamo FloremoriaLog per ora, oppure aggiungiamo un campo a User se avessimo bisogno.
        // Guardando lo Schema Prisma, Order ha `additionalInstructions`.
        
        // Prendiamo l'ultimo ordine attivo e aggiorniamolo, oppure semplicemente loggiamo per il customer service.
        const lastOrder = await prisma.order.findFirst({
            where: { userId: userId },
            orderBy: { createdAt: 'desc' }
        });

        if (lastOrder) {
            const existingNotes = lastOrder.additionalInstructions || '';
            const newNotes = existingNotes ? `${existingNotes}\n\n[Aggiornamento dal Giardino]: ${notes}` : `[Dal Giardino]: ${notes}`;

            await prisma.order.update({
                where: { id: lastOrder.id },
                data: {
                    additionalInstructions: newNotes
                }
            });

            revalidatePath(`/giardino/${userId}`);
            return { success: true };
        }

        return { success: false, message: 'Nessun ordine trovato a cui associare la nota.' };

    } catch (error) {
        console.error('Error updating grave notes:', error);
        return { success: false, message: 'Internal server error.' };
    }
}
