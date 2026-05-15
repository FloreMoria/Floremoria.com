import { NextResponse } from 'next/server';
import { getFloremAuthCookieBase } from '@/lib/authCookieDomain';
import { SUPER_ADMIN_ROLE_NAME } from '@/lib/superAdmin';
import { superAdminLoginDevHint, verifySuperAdminCredentials } from '@/lib/superAdminLogin';

function setAuthCookies(response: NextResponse, request: Request, roleName: string, expiresAt?: Date) {
    const base = getFloremAuthCookieBase({ headers: request.headers, url: request.url });
    const opts = {
        name: 'fm_user_role' as const,
        value: roleName,
        httpOnly: true,
        path: base.path,
        ...(base.domain ? { domain: base.domain } : {}),
        secure: base.secure,
        sameSite: base.sameSite,
        maxAge: 60 * 60 * 24 * 7,
    };
    response.cookies.set(opts);
    if (expiresAt) {
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
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const username = typeof body.username === 'string' ? body.username.trim() : '';
        const password = typeof body.password === 'string' ? body.password : '';

        if (!username || !password) {
            return NextResponse.json({ success: false, message: 'Credenziali non valide' }, { status: 401 });
        }

        // Super Admin: email nel campo "Identificativo" + SUPER_ADMIN_LOGIN_PASSWORD (env).
        if (username.includes('@')) {
            const result = await verifySuperAdminCredentials(username, password);
            if (result.ok) {
                const response = NextResponse.json({
                    success: true,
                    redirectUrl: '/admin-panel',
                });
                setAuthCookies(response, request, SUPER_ADMIN_ROLE_NAME);
                return response;
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

        // Bootstrap dev locale esplicito (non usare in produzione).
        const devBootstrap =
            process.env.NODE_ENV === 'development' &&
            process.env.ALLOW_DEV_SUPER_ADMIN_LOGIN === 'true';
        if (devBootstrap && username === 'admin' && password === '2212') {
            const response = NextResponse.json({
                success: true,
                redirectUrl: '/admin-panel',
                hint: 'Sessione dev: promuovi il tuo account con npm run master-key per login via email.',
            });
            setAuthCookies(response, request, SUPER_ADMIN_ROLE_NAME);
            return response;
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
