import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import bcryptjs from 'bcryptjs';
import { getFloremAuthCookieBase } from '@/lib/authCookieDomain';
import { UserRole } from '@prisma/client';

function setAuthCookies(response: NextResponse, request: Request, roleName: string, email?: string, expiresAt?: Date) {
    const base = getFloremAuthCookieBase({ headers: request.headers, url: request.url });
    const opts = {
        httpOnly: true,
        path: base.path,
        ...(base.domain ? { domain: base.domain } : {}),
        secure: base.secure,
        sameSite: base.sameSite,
        maxAge: 60 * 60 * 24 * 7,
    };
    response.cookies.set({
        ...opts,
        name: 'fm_user_role',
        value: roleName,
    });
    if (email) {
        response.cookies.set({
            ...opts,
            name: 'fm_user_email',
            value: email,
        });
    }
    if (expiresAt) {
        response.cookies.set({
            ...opts,
            name: 'fm_role_expires_at',
            value: expiresAt.toISOString(),
        });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const token = typeof body.token === 'string' ? body.token.trim() : '';
        const password = typeof body.password === 'string' ? body.password : '';

        if (!token) {
            return NextResponse.json({ success: false, message: 'Token mancante.' }, { status: 400 });
        }

        const user = await prisma.user.findFirst({
            where: { resetPasswordToken: token }
        });

        if (!user) {
            return NextResponse.json({ success: false, message: 'Token non valido o scaduto.' }, { status: 404 });
        }

        if (user.resetPasswordTokenExpires && new Date() > user.resetPasswordTokenExpires) {
            return NextResponse.json({ success: false, message: 'Il link per reimpostare la password è scaduto (validità di 1 ora superata).' }, { status: 400 });
        }

        // Validazione password: minimo 8 caratteri, un numero, una maiuscola
        const hasNumber = /[0-9]/.test(password);
        const hasUppercase = /[A-Z]/.test(password);

        if (password.length < 8 || !hasNumber || !hasUppercase) {
            return NextResponse.json({
                success: false,
                message: 'La password deve contenere almeno 8 caratteri, un numero e una lettera maiuscola.'
            }, { status: 400 });
        }

        const passwordHash = await bcryptjs.hash(password, 12);

        await prisma.user.update({
            where: { id: user.id },
            data: {
                passwordHash,
                isActivated: true, // if they reset password, they are activated
                isActive: true,
                resetPasswordToken: null,
                resetPasswordTokenExpires: null
            }
        });

        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
        let redirectUrl = '/dashboard';
        
        if (user.systemRole === UserRole.USER) {
            redirectUrl = '/dashboard/user';
        } else if (user.systemRole === UserRole.FLORIST || user.systemRole === UserRole.AGENCY) {
            redirectUrl = '/dashboard/orders';
        }

        const response = NextResponse.json({
            success: true,
            redirectUrl,
            message: 'Password reimpostata con successo!'
        });

        setAuthCookies(response, request, user.systemRole, user.email, expiresAt);
        return response;
    } catch (error) {
        console.error('[auth-reset-password] Errore:', error);
        return NextResponse.json({ success: false, message: 'Errore interno del server.' }, { status: 500 });
    }
}
