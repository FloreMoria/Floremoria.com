import { NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import { generateOtpToken } from '@/lib/auth/otp';
import { parseIdentifier, findOrCreatePasswordlessUser } from '@/lib/auth/identity';
import { sendAuthWhatsAppMessage } from '@/lib/auth/sendAuthWhatsApp';
import { checkHoneypot, checkRateLimit, getClientIp } from '@/lib/security/antiBot';

export async function POST(request: Request) {
    try {
        const body = await request.json();

        // 1. Protezione Honeypot anti-bot
        if (checkHoneypot(body)) {
            console.warn('[otp-request] Bot intercettato tramite Honeypot');
            return NextResponse.json({ success: true, message: 'Operazione completata.' });
        }

        // 2. Rate limiting basato su IP
        const clientIp = getClientIp(request);
        const rateLimit = checkRateLimit(clientIp, 5, 10 * 60 * 1000);
        if (rateLimit.isRateLimited) {
            return NextResponse.json(
                { success: false, message: `Troppi tentativi. Riprova tra ${rateLimit.resetInSeconds} secondi.` },
                { status: 429 }
            );
        }

        const identifier = typeof body.identifier === 'string' ? body.identifier.trim() : '';

        const parsed = parseIdentifier(identifier);
        if (!parsed) {
            return NextResponse.json(
                { success: false, message: 'Fornire un indirizzo email o un numero di telefono valido.' },
                { status: 400 }
            );
        }

        const user = await findOrCreatePasswordlessUser(parsed);

        if (!user) {
            const message = 'Registrazione consentita solo ai clienti con un ordine completato su FloreMoria.';
            return NextResponse.json({ success: false, message }, { status: 404 });
        }


        if (user.systemRole !== UserRole.USER) {
            return NextResponse.json(
                { success: false, message: 'L\'accesso passwordless (OTP) è riservato ai clienti privati.' },
                { status: 403 }
            );
        }

        if (!user.phone) {
            return NextResponse.json(
                { success: false, message: 'Nessun numero di telefono associato a questo account. Accedi tramite Magic Link via email.' },
                { status: 400 }
            );
        }

        const email = user.email;
        const phone = user.phone;

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const tempToken = generateOtpToken(email, phone, code);

        const messageText = `Il tuo codice di accesso FloreMoria è: ${code}. Valido per 5 minuti.`;
        const sendResult = await sendAuthWhatsAppMessage(phone, messageText);

        if (!sendResult.ok) {
            console.error('[OTP-request] Invio WhatsApp fallito:', sendResult.error);
            return NextResponse.json(
                { success: false, message: 'Impossibile inviare il codice di verifica. Riprova più tardi.' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            tempToken,
            message: 'Ti abbiamo inviato un codice di verifica di 6 cifre tramite WhatsApp.',
            method: 'whatsapp',
        });
    } catch (error) {
        console.error('[OTP-request] Errore:', error);
        return NextResponse.json(
            { success: false, message: 'Si è verificato un errore interno durante la richiesta del codice OTP.' },
            { status: 500 }
        );
    }
}
