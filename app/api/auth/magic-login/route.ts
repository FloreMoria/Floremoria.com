import { NextResponse } from 'next/server';
import { getFloremAuthCookieBase } from '@/lib/authCookieDomain';
import { UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';
import { sanitizeMagicLinkToken, verifyMagicLinkTokenDetailed } from '@/lib/auth/magicLink';
import { getSiteBaseUrl } from '@/lib/site/config';

function setAuthCookies(response: NextResponse, request: Request, roleName: string, email: string, expiresAt: Date) {
    const base = getFloremAuthCookieBase({ headers: request.headers, url: request.url });

    response.cookies.set({
        name: 'fm_user_role',
        value: roleName,
        httpOnly: true,
        path: base.path,
        ...(base.domain ? { domain: base.domain } : {}),
        secure: base.secure,
        sameSite: base.sameSite,
        maxAge: 60 * 60 * 24 * 7,
    });

    response.cookies.set({
        name: 'fm_user_email',
        value: email.trim().toLowerCase(),
        httpOnly: true,
        path: base.path,
        ...(base.domain ? { domain: base.domain } : {}),
        secure: base.secure,
        sameSite: base.sameSite,
        maxAge: 60 * 60 * 24 * 7,
    });

    response.cookies.set({
        name: 'fm_role_expires_at',
        value: expiresAt.toISOString(),
        httpOnly: true,
        path: base.path,
        ...(base.domain ? { domain: base.domain } : {}),
        secure: base.secure,
        sameSite: base.sameSite,
        maxAge: 60 * 60 * 24 * 7,
    });
}

/** Accesso automatico area riservata via token firmato (es. link WhatsApp post-consegna, 24h). */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const token = sanitizeMagicLinkToken(searchParams.get('token') || '');
    const baseUrl = getSiteBaseUrl();

    if (!token) {
        return NextResponse.redirect(`${baseUrl}/login?error=magic_link_invalid`);
    }

    const verified = verifyMagicLinkTokenDetailed(token);
    if (!verified.ok) {
        const err = verified.reason === 'expired' ? 'magic_link_expired' : 'magic_link_invalid';
        return NextResponse.redirect(`${baseUrl}/login?error=${err}`);
    }

    try {
        let user = await prisma.user.findUnique({ where: { email: verified.email } });

        if (!user) {
            user = await prisma.user.create({
                data: {
                    email: verified.email,
                    systemRole: UserRole.USER,
                    isActive: true,
                },
            });
        }

        if (user.systemRole !== UserRole.USER) {
            return NextResponse.redirect(`${baseUrl}/login?error=unauthorized_role`);
        }

        await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
        });

        const dashboardUrl = `${baseUrl}/dashboard/user`;
        const response = NextResponse.redirect(dashboardUrl);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        setAuthCookies(response, request, UserRole.USER, user.email, expiresAt);

        return response;
    } catch (error) {
        console.error('[magic-login] Errore di connessione o Prisma:', error);
        return NextResponse.redirect(`${baseUrl}/login?error=server_error`);
    }
}
