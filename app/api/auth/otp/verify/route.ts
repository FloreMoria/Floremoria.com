import { NextResponse } from 'next/server';
import { getFloremAuthCookieBase } from '@/lib/authCookieDomain';
import { UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';
import { verifyOtpToken } from '@/lib/auth/otp';

function setAuthCookies(response: NextResponse, request: Request, roleName: string, email: string, expiresAt: Date) {
    const base = getFloremAuthCookieBase({ headers: request.headers, url: request.url });
    const opts = {
        httpOnly: true,
        path: base.path,
        ...(base.domain ? { domain: base.domain } : {}),
        secure: base.secure,
        sameSite: base.sameSite,
        maxAge: 60 * 60 * 24 * 7, // 7 giorni
    };

    response.cookies.set({
        ...opts,
        name: 'fm_user_role',
        value: roleName,
    });

    response.cookies.set({
        ...opts,
        name: 'fm_user_email',
        value: email,
    });

    response.cookies.set({
        ...opts,
        name: 'fm_role_expires_at',
        value: expiresAt.toISOString(),
    });
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { code, tempToken } = body;

        if (!code || !tempToken) {
            return NextResponse.json(
                { success: false, message: 'Dati mancanti per la verifica.' },
                { status: 400 }
            );
        }

        // Verifica il codice e il token OTP stateless
        const credentials = verifyOtpToken(tempToken, code);

        if (!credentials) {
            return NextResponse.json(
                { success: false, message: 'Codice di verifica errato o scaduto. Riprova.' },
                { status: 400 }
            );
        }

        const { email } = credentials;

        // Cerca l'utente per sicurezza
        const user = await prisma.user.findUnique({
            where: { email },
        });

        if (!user || user.systemRole !== UserRole.USER) {
            return NextResponse.json(
                { success: false, message: 'Account non autorizzato per l\'accesso clienti.' },
                { status: 403 }
            );
        }

        // Aggiorna ultimo login
        await prisma.user.update({
            where: { id: user.id },
            data: {
                lastLoginAt: new Date(),
            },
        });

        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.floremoria.com';
        const dashboardUrl = `${baseUrl}/dashboard/user`;
        const response = NextResponse.json({
            success: true,
            redirectUrl: dashboardUrl,
        });

        // Imposta i cookie di sessione per 7 giorni
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        setAuthCookies(response, request, UserRole.USER, user.email, expiresAt);

        return response;
    } catch (error) {
        console.error('[OTP-verify] Errore:', error);
        return NextResponse.json(
            { success: false, message: 'Si è verificato un errore interno durante la verifica.' },
            { status: 500 }
        );
    }
}
