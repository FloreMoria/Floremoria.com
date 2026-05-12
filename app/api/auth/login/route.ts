import { NextResponse } from 'next/server';
import { getFloremAuthCookieBase } from '@/lib/authCookieDomain';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { username, password } = body;

        // Hardcoded login base come richiesto (Username: admin, Password: 2212)
        if (username === 'admin' && password === '2212') {
            const response = NextResponse.json({ success: true, redirectUrl: '/dashboard/orders' }, { status: 200 });

            const base = getFloremAuthCookieBase({ headers: request.headers, url: request.url });

            // Cookie condiviso www ↔ dashboard in produzione (domain .floremoria.com)
            response.cookies.set({
                name: 'fm_user_role',
                value: 'SUPER_ADMIN',
                httpOnly: true,
                path: base.path,
                ...(base.domain ? { domain: base.domain } : {}),
                secure: base.secure,
                sameSite: base.sameSite,
                maxAge: 60 * 60 * 24 * 7, // 1 settimana
            });

            return response;
        }

        return NextResponse.json({ success: false, message: 'Credenziali non valide' }, { status: 401 });
    } catch (error) {
        return NextResponse.json({ success: false, message: 'Errore interno del server' }, { status: 500 });
    }
}
