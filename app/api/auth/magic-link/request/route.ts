import { NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';
import { generateMagicLinkToken } from '@/lib/auth/magicLink';
import { sendMagicLinkEmail } from '@/lib/auth/magicLinkEmail';
import { sendWhatsAppMessage } from '@/lib/auth/twilio';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

        if (!email || !email.includes('@')) {
            return NextResponse.json(
                { success: false, message: 'Fornire un indirizzo email valido.' },
                { status: 400 }
            );
        }

        // Cerca l'utente a database per verificare il ruolo
        let user = await prisma.user.findUnique({
            where: { email },
        });

        if (user) {
            // Se l'utente esiste ma non è un utente finale (B2C), inibisci il magic link.
            // I fioristi, commercialisti, staff e admin devono accedere con credenziali/password.
            if (user.systemRole !== UserRole.USER) {
                return NextResponse.json(
                    { 
                        success: false, 
                        message: 'Questo metodo di accesso è riservato agli utenti privati. Per lo Staff e i Fioristi Partner è richiesto l\'accesso tramite codice personale.' 
                    },
                    { status: 400 }
                );
            }
        } else {
            // Creazione silenziosa (Onboarding) se l'utente non è censito a database.
            // Il sistema crea l'anagrafica USER ed è subito attiva.
            user = await prisma.user.create({
                data: {
                    email,
                    systemRole: UserRole.USER,
                    isActive: true,
                },
            });
        }

        // Genera il token crittografato firmato a 15 minuti
        const token = generateMagicLinkToken(email);

        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.floremoria.com';
        const setupLink = `${baseUrl}/api/auth/magic-link/callback?token=${token}`;

        // Invia l'email con il link magico
        const mailResult = await sendMagicLinkEmail({
            email,
            setupLink,
        });

        if (!mailResult.ok) {
            console.error('[magic-link] Invio email fallito:', mailResult.error);
            return NextResponse.json(
                { success: false, message: 'Impossibile inviare l\'email di accesso. Riprova più tardi.' },
                { status: 500 }
            );
        }

        // Se l'utente ha registrato un numero di telefono, inviamo il magic link anche via WhatsApp
        let sentWhatsApp = false;
        if (user.phone) {
            const messageText = `Gentile cliente, ecco il Suo link di accesso rapido (valido per 15 minuti) per accedere alla bacheca FloreMoria e tracciare la posa degli omaggi floreali:\n\n${setupLink}`;
            const waResult = await sendWhatsAppMessage(user.phone, messageText);
            sentWhatsApp = waResult.ok;
        }

        return NextResponse.json({
            success: true,
            message: sentWhatsApp
                ? 'Ti abbiamo inviato un collegamento di accesso via email e tramite WhatsApp.'
                : 'Ti abbiamo inviato un collegamento di accesso via email.',
        });
    } catch (error) {
        console.error('[magic-link-request] Errore:', error);
        return NextResponse.json(
            { success: false, message: 'Si è verificato un errore interno durante la richiesta di accesso.' },
            { status: 500 }
        );
    }
}
