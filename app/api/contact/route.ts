import { NextResponse } from 'next/server';
import { sendFloremTransactionalMail } from '@/lib/serverMail';
import { checkRateLimit } from '@/lib/security/antiBot';

export const runtime = 'nodejs';

type ContactBody = {
    name?: string;
    email?: string;
    phone?: string;
    message?: string;
    /** Honeypot — se valorizzato, silenziosamente OK senza invio. */
    website?: string;
};

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * POST pubblico — form contatti → email assistenza@floremoria.com.
 * Rate-limit per IP; honeypot anti-bot.
 */
export async function POST(request: Request) {
    try {
        const clientIp =
            request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
            request.headers.get('x-real-ip') ||
            'unknown';

        const rate = checkRateLimit(`contact:${clientIp}`, 8, 15 * 60 * 1000);
        if (rate.isRateLimited) {
            return NextResponse.json(
                { ok: false, error: `Troppi tentativi. Riprova tra ${rate.resetInSeconds} secondi.` },
                { status: 429 }
            );
        }

        const body = (await request.json()) as ContactBody;

        if (body.website?.trim()) {
            return NextResponse.json({ ok: true });
        }

        const name = (body.name || '').trim().slice(0, 120);
        const email = (body.email || '').trim().toLowerCase().slice(0, 160);
        const phone = (body.phone || '').trim().slice(0, 40);
        const message = (body.message || '').trim().slice(0, 4000);

        if (!name || !email || !message) {
            return NextResponse.json(
                { ok: false, error: 'Nome, email e messaggio sono obbligatori.' },
                { status: 400 }
            );
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return NextResponse.json({ ok: false, error: 'Email non valida.' }, { status: 400 });
        }

        const safeName = escapeHtml(name);
        const safeEmail = escapeHtml(email);
        const safePhone = escapeHtml(phone || '—');
        const safeMessage = escapeHtml(message).replace(/\n/g, '<br />');

        const result = await sendFloremTransactionalMail({
            to: 'assistenza@floremoria.com',
            replyTo: email,
            subject: `[Contatti web] ${name.slice(0, 60)}`,
            html: `
                <div style="font-family: Georgia, serif; color: #2b2b2b; line-height: 1.55; max-width: 560px;">
                    <p style="font-size: 14px; color: #666;">Nuova richiesta dal form contatti FloreMoria</p>
                    <p><strong>Nome:</strong> ${safeName}</p>
                    <p><strong>Email:</strong> ${safeEmail}</p>
                    <p><strong>Telefono:</strong> ${safePhone}</p>
                    <p><strong>Messaggio:</strong></p>
                    <p style="white-space: pre-wrap; background: #faf9f6; padding: 16px; border-radius: 12px; border: 1px solid #eee;">${safeMessage}</p>
                </div>
            `,
            text: `Nome: ${name}\nEmail: ${email}\nTelefono: ${phone || '—'}\n\nMessaggio:\n${message}`,
        });

        if (!result.ok) {
            console.error('[api/contact] mail failed:', result.error);
            return NextResponse.json(
                { ok: false, error: 'Invio email non riuscito. Puoi scriverci su WhatsApp.' },
                { status: 502 }
            );
        }

        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error('[api/contact]', err);
        return NextResponse.json({ ok: false, error: 'Errore imprevisto.' }, { status: 500 });
    }
}
