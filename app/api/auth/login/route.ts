import { NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import { getFloremAuthCookieBase } from '@/lib/authCookieDomain';
import {
    ADMIN_POST_LOGIN_REDIRECT,
    ADMIN_ROLE_NAME,
    SUPER_ADMIN_POST_LOGIN_REDIRECT,
    SUPER_ADMIN_ROLE_NAME,
} from '@/lib/superAdmin';
import {
    postLoginRedirectForRole,
    resolveLegacyElevatedRole,
    superAdminLoginDevHint,
    verifyLegacyAdminPassword,
    verifyLegacySuperAdminPassword,
    verifySuperAdminCredentials,
} from '@/lib/superAdminLogin';
import { ensureElevatedUserRecord } from '@/lib/auth/ensureElevatedUser';
import prisma from '@/lib/prisma';

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
        const username = typeof body.username === 'string' ? body.username.trim() : '';
        const password = typeof body.password === 'string' ? body.password : '';

        if (!username || !password) {
            return NextResponse.json({ success: false, message: 'Credenziali non valide' }, { status: 401 });
        }

        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

        // Legacy SUPER_ADMIN: cookie SUPER_ADMIN → pagina Ruoli.
        const legacyRole = resolveLegacyElevatedRole(username);
        if (legacyRole === SUPER_ADMIN_ROLE_NAME) {
            if (verifyLegacySuperAdminPassword(password)) {
                const sessionEmail = username.includes('@') ? username.toLowerCase() : 'superadmin@floremoria.local';
                await ensureElevatedUserRecord(sessionEmail, SUPER_ADMIN_ROLE_NAME);
                const response = NextResponse.json({
                    success: true,
                    redirectUrl: SUPER_ADMIN_POST_LOGIN_REDIRECT,
                });
                setAuthCookies(response, request, SUPER_ADMIN_ROLE_NAME, sessionEmail, expiresAt);
                return response;
            }
            return NextResponse.json({ success: false, message: 'Credenziali non valide.' }, { status: 401 });
        }

        // Legacy ADMIN: cookie ADMIN → Overview dashboard (no Ruoli).
        if (legacyRole === ADMIN_ROLE_NAME) {
            if (verifyLegacyAdminPassword(password)) {
                const sessionEmail = username.includes('@') ? username.toLowerCase() : 'admin@floremoria.local';
                await ensureElevatedUserRecord(sessionEmail, ADMIN_ROLE_NAME);
                const response = NextResponse.json({
                    success: true,
                    redirectUrl: ADMIN_POST_LOGIN_REDIRECT,
                });
                setAuthCookies(response, request, ADMIN_ROLE_NAME, sessionEmail, expiresAt);
                return response;
            }
            return NextResponse.json({ success: false, message: 'Credenziali non valide.' }, { status: 401 });
        }

        // Super Admin promosso a DB (email + SUPER_ADMIN_LOGIN_PASSWORD).
        if (username.includes('@')) {
            const result = await verifySuperAdminCredentials(username, password);
            if (result.ok) {
                const response = NextResponse.json({
                    success: true,
                    redirectUrl: SUPER_ADMIN_POST_LOGIN_REDIRECT,
                });
                setAuthCookies(response, request, SUPER_ADMIN_ROLE_NAME, username, expiresAt);
                return response;
            }

            const user = await prisma.user.findUnique({
                where: { email: username.toLowerCase() },
            });

            if (user && user.isActive && user.passwordHash) {
                const bcryptjs = await import('bcryptjs');
                const passwordMatch = await bcryptjs.compare(password, user.passwordHash);

                if (passwordMatch) {
                    await prisma.user.update({
                        where: { id: user.id },
                        data: { lastLoginAt: new Date() },
                    });

                    let redirectUrl = '/dashboard';
                    if (user.systemRole === UserRole.USER) {
                        redirectUrl = '/dashboard/user';
                    } else if (user.systemRole === UserRole.FLORIST || user.systemRole === UserRole.AGENCY) {
                        redirectUrl = '/dashboard/orders';
                    } else if (user.systemRole === UserRole.SUPER_ADMIN) {
                        redirectUrl = SUPER_ADMIN_POST_LOGIN_REDIRECT;
                    } else if (user.systemRole === UserRole.ADMIN) {
                        redirectUrl = ADMIN_POST_LOGIN_REDIRECT;
                    } else {
                        redirectUrl = postLoginRedirectForRole(user.systemRole);
                    }

                    const response = NextResponse.json({
                        success: true,
                        redirectUrl,
                    });

                    setAuthCookies(response, request, user.systemRole, user.email, expiresAt);
                    return response;
                }
            }

            const hint = superAdminLoginDevHint(result.reason);
            return NextResponse.json(
                {
                    success: false,
                    message: 'Credenziali non valide.',
                    ...(hint ? { hint } : {}),
                },
                { status: 401 }
            );
        }

        return NextResponse.json({ success: false, message: 'Credenziali non valide' }, { status: 401 });
    } catch (error) {
        console.error('Login error:', error);
        const isDev = process.env.NODE_ENV === 'development';
        const message =
            isDev && error instanceof Error && error.message.includes('system_role')
                ? 'Database non aggiornato: esegui npx prisma migrate deploy'
                : 'Errore interno del server';
        return NextResponse.json({ success: false, message }, { status: 500 });
    }
}
