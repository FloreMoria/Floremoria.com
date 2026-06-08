import { NextResponse } from 'next/server';
import { generateMagicLinkToken } from '@/lib/auth/magicLink';
import { sendMagicLinkEmail } from '@/lib/auth/magicLinkEmail';
import { parseIdentifier, registerPasswordlessUser } from '@/lib/auth/identity';
import { generateOtpToken } from '@/lib/auth/otp';
import { sendSMSMessage, sendWhatsAppMessage } from '@/lib/auth/twilio';

/**
 * Attivazione profilo B2C: crea l'account USER (se assente) e invia Magic Link o OTP.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const identifier = typeof body.identifier === 'string' ? body.identifier.trim() : '';

        const parsed = parseIdentifier(identifier);
        if (!parsed) {
            return NextResponse.json(
                { success: false, message: 'Inserisci un indirizzo email o un numero di telefono valido.' },
                { status: 400 }
            );
        }

        const registration = await registerPasswordlessUser(parsed);
        if (!registration) {
            return NextResponse.json(
                {
                    success: false,
                    message: 'Questo contatto è già associato a un account professionale. Accedi con email e password.',
                },
                { status: 403 }
            );
        }

        const { user, channel } = registration;

        if (channel === 'email' && parsed.email) {
            const token = generateMagicLinkToken(parsed.email);
            const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.floremoria.com';
            const setupLink = `${baseUrl}/api/auth/magic-link/callback?token=${token}`;

            const mailResult = await sendMagicLinkEmail({ email: parsed.email, setupLink });
            if (!mailResult.ok) {
                return NextResponse.json(
                    { success: false, message: 'Impossibile inviare l\'email di attivazione. Riprova più tardi.' },
                    { status: 500 }
                );
            }

            let sentWhatsApp = false;
            if (user.phone) {
                const messageText = `Gentile utente, ecco il Suo link di attivazione profilo FloreMoria (valido 15 minuti):\n\n${setupLink}`;
                const waResult = await sendWhatsAppMessage(user.phone, messageText);
                sentWhatsApp = waResult.ok;
            }

            return NextResponse.json({
                success: true,
                channel: 'email',
                message: sentWhatsApp
                    ? 'Profilo attivato: controlla email e WhatsApp per il collegamento di accesso.'
                    : 'Profilo attivato: controlla la tua email per il collegamento di accesso.',
            });
        }

        // Canale telefono → OTP
        if (!user.phone) {
            return NextResponse.json(
                { success: false, message: 'Impossibile associare un numero di telefono al profilo.' },
                { status: 400 }
            );
        }

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const tempToken = generateOtpToken(user.email, user.phone, code);
        const messageText = `Il tuo codice di attivazione profilo FloreMoria è: ${code}. Valido per 5 minuti.`;

        let sentMethod = 'whatsapp';
        const waResult = await sendWhatsAppMessage(user.phone, messageText);
        if (!waResult.ok) {
            const smsResult = await sendSMSMessage(user.phone, messageText);
            if (!smsResult.ok) {
                return NextResponse.json(
                    { success: false, message: 'Impossibile inviare il codice di attivazione. Riprova più tardi.' },
                    { status: 500 }
                );
            }
            sentMethod = 'sms';
        }

        return NextResponse.json({
            success: true,
            channel: 'phone',
            tempToken,
            method: sentMethod,
            message: `Profilo attivato: codice inviato tramite ${sentMethod === 'whatsapp' ? 'WhatsApp' : 'SMS'}.`,
        });
    } catch (error) {
        console.error('[auth-register] Errore:', error);
        return NextResponse.json(
            { success: false, message: 'Si è verificato un errore interno durante l\'attivazione del profilo.' },
            { status: 500 }
        );
    }
}
