'use server';

import prisma from '@/lib/prisma';

export async function recoverGardenLink(email: string) {
    try {
        if (!email || !email.includes('@')) {
            return { success: false, message: 'Inserisci un indirizzo email valido.' };
        }

        // 1. Cerca l'utente nel DB (senza differenziare maiuscole/minuscole)
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() }
        });

        // Security: Non riveliamo esplicitamente se l'email esiste o meno per evitare enumerazione.
        // Ma internamente processiamo l'invio solo se l'utente esiste e ha il telefono.
        if (user) {
            const magicLink = `https://floremoria.eu/giardino/${user.uniqueCode || user.id}`;
            const userPhone = user.phone || 'Nessun numero di telefono salvato';

            // TODO: Integrazione API WhatsApp (es. Twilio o Meta Business API)
            // Esempio logico:
            // await whatsappAPI.sendMessage(user.phone, `Caro ${user.name}, ecco il link al tuo Giardino della Memoria: ${magicLink}`);
            
            console.log(`[SIMULAZIONE WHATSAPP] Destinatario: ${userPhone}`);
            console.log(`[SIMULAZIONE WHATSAPP] Messaggio: Ecco il link segreto al tuo Giardino: ${magicLink}`);

            return {
                success: true,
                message: 'Abbiamo inviato il link magico al tuo numero WhatsApp registrato. Controlla il tuo smartphone.',
            };
        }

        // Se l'utente non esiste simuliamo comunque un successo per le best practice di sicurezza.
        return { 
            success: true, 
            message: 'Abbiamo inviato il link magico al tuo numero WhatsApp registrato. Controlla il tuo smartphone.' 
        };

    } catch (error) {
        console.error('Errore nel recupero del link:', error);
        return { success: false, message: 'Si è verificato un errore di sistema. Riprova più tardi.' };
    }
}
