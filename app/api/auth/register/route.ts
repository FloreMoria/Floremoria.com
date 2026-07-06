import { NextResponse } from 'next/server';
import { generateMagicLinkToken } from '@/lib/auth/magicLink';
import { sendMagicLinkEmail } from '@/lib/auth/magicLinkEmail';
import { parseIdentifier, registerPasswordlessUser } from '@/lib/auth/identity';
import { generateOtpToken } from '@/lib/auth/otp';
import { sendAuthWhatsAppMessage } from '@/lib/auth/sendAuthWhatsApp';
import { getSiteBaseUrl } from '@/lib/site/config';

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
            const setupLink = `${getSiteBaseUrl()}/api/auth/magic-link/callback?token=${token}`;

            const mailResult = await sendMagicLinkEmail({ email: parsed.email, setupLink });
            if (!mailResult.ok) {
                return NextResponse.json(
                    { success: false, message: 'Impossibile inviare l\'email di attivazione. Riprova più tardi.' },
                    { status: 500 }
                );
            }

            let sentWhatsApp = false;
            if (user.phone) {
                const waText = `FloreMoria — attiva il tuo profilo con questo link (valido 15 minuti): ${setupLink}`;
                const waResult = await sendAuthWhatsAppMessage(user.phone, waText);
                sentWhatsApp = waResult.ok;
                if (!waResult.ok) {
                    console.warn('[auth-register] Magic link WhatsApp non inviato:', waResult.error);
                }
            }

            return NextResponse.json({
                success: true,
                channel: 'email',
                message: sentWhatsApp
                    ? 'Profilo attivato: controlla email e WhatsApp per il collegamento di accesso.'
                    : 'Profilo attivato: controlla la tua email per il collegamento di accesso.',
            });
        }

        if (!user.phone) {
            return NextResponse.json(
                { success: false, message: 'Impossibile associare un numero di telefono al profilo.' },
                { status: 400 }
            );
        }

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const tempToken = generateOtpToken(user.email, user.phone, code);
        const messageText = `Il tuo codice di attivazione profilo FloreMoria è: ${code}. Valido per 5 minuti.`;

        const sendResult = await sendAuthWhatsAppMessage(user.phone, messageText);
        if (!sendResult.ok) {
            console.error('[auth-register] Invio OTP WhatsApp fallito:', sendResult.error);
            return NextResponse.json(
                { success: false, message: 'Impossibile inviare il codice di attivazione. Riprova più tardi.' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            channel: 'phone',
            tempToken,
            method: 'whatsapp',
            message: 'Profilo attivato: codice inviato tramite WhatsApp.',
        });
    } catch (error) {
        console.error('[auth-register] Errore:', error);
        return NextResponse.json(
            { success: false, message: 'Si è verificato un errore interno durante l\'attivazione del profilo.' },
            { status: 500 }
        );
    }
}
