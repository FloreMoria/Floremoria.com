import { NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';
import { generateOtpToken } from '@/lib/auth/otp';
import { sendWhatsAppMessage, sendSMSMessage, formatPhoneNumber } from '@/lib/auth/twilio';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const identifier = typeof body.identifier === 'string' ? body.identifier.trim() : '';

        if (!identifier) {
            return NextResponse.json(
                { success: false, message: 'Fornire un indirizzo email o un numero di telefono valido.' },
                { status: 400 }
            );
        }

        let email = '';
        let phone = '';
        let user = null;

        // Determina se l'identificativo è un'email o un numero di telefono
        if (identifier.includes('@')) {
            email = identifier.toLowerCase();
            user = await prisma.user.findUnique({
                where: { email },
            });

            if (!user) {
                return NextResponse.json(
                    { success: false, message: 'Indirizzo email non registrato. Effettua un acquisto per creare un account.' },
                    { status: 404 }
                );
            }

            if (!user.phone) {
                return NextResponse.json(
                    { success: false, message: 'Nessun numero di telefono associato a questo account. Accedi tramite Magic Link.' },
                    { status: 400 }
                );
            }

            phone = user.phone;
        } else {
            // È un numero di telefono, normalizzalo per la ricerca
            const rawPhone = identifier.replace(/[^0-9+]/g, '');
            if (rawPhone.length < 6) {
                return NextResponse.json(
                    { success: false, message: 'Fornire un numero di telefono valido.' },
                    { status: 400 }
                );
            }

            // Ricerca parziale o esatta
            const normalizedSMS = formatPhoneNumber(rawPhone, 'sms');
            const normalizedWA = formatPhoneNumber(rawPhone, 'whatsapp');
            
            // Cerca un utente che contenga questo numero di telefono
            user = await prisma.user.findFirst({
                where: {
                    OR: [
                        { phone: rawPhone },
                        { phone: normalizedSMS },
                        { phone: normalizedSMS.replace('+39', '') },
                        { phone: { contains: rawPhone } }
                    ]
                }
            });

            if (!user) {
                return NextResponse.json(
                    { success: false, message: 'Numero di telefono non trovato o non associato ad alcun ordine.' },
                    { status: 404 }
                );
            }

            email = user.email;
            phone = user.phone || rawPhone;
        }

        // Impedisce l'accesso passwordless per ruoli commerciali / staff / admin
        if (user.systemRole !== UserRole.USER) {
            return NextResponse.json(
                { success: false, message: 'L\'accesso passwordless (OTP) è riservato ai clienti privati.' },
                { status: 403 }
            );
        }

        // Genera il codice di verifica a 6 cifre
        const code = Math.floor(100000 + Math.random() * 900000).toString();

        // Genera il token OTP firmato con scadenza a 5 minuti
        const tempToken = generateOtpToken(email, phone, code);

        const messageText = `Il tuo codice di verifica FloreMoria è: ${code}. Inseriscilo nella pagina di accesso. Valido per 5 minuti.`;

        // Tenta l'invio tramite WhatsApp; in caso di errore, effettua fallback su SMS
        let sentMethod = 'whatsapp';
        const waResult = await sendWhatsAppMessage(phone, messageText);
        
        if (!waResult.ok) {
            console.warn('[OTP] Invio WhatsApp fallito, provo fallback su SMS...');
            const smsResult = await sendSMSMessage(phone, messageText);
            if (!smsResult.ok) {
                console.error('[OTP] Invio SMS fallito:', smsResult.error);
                return NextResponse.json(
                    { success: false, message: 'Impossibile inviare il codice di verifica. Riprova più tardi.' },
                    { status: 500 }
                );
            }
            sentMethod = 'sms';
        }

        return NextResponse.json({
            success: true,
            tempToken,
            message: `Ti abbiamo inviato un codice di verifica di 6 cifre tramite ${sentMethod === 'whatsapp' ? 'WhatsApp' : 'SMS'}.`,
            method: sentMethod,
        });
    } catch (error) {
        console.error('[OTP-request] Errore:', error);
        return NextResponse.json(
            { success: false, message: 'Si è verificato un errore interno durante la richiesta del codice OTP.' },
            { status: 500 }
        );
    }
}
