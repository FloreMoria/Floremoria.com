import { NextResponse } from 'next/server';
import { getFloremAuthCookieBase } from '@/lib/authCookieDomain';

export async function GET(request: Request) {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.floremoria.com';
    const response = NextResponse.redirect(`${baseUrl}/login`);

    const cookieBase = getFloremAuthCookieBase({
        headers: request.headers,
        url: request.url,
    });

    const clearCookieOpts = {
        path: cookieBase.path,
        ...(cookieBase.domain ? { domain: cookieBase.domain } : {}),
        maxAge: 0, // Invalida immediatamente
    };

    // Cancella tutti i cookie di autenticazione e di identità
    response.cookies.delete({ name: 'fm_user_role', ...clearCookieOpts });
    response.cookies.delete({ name: 'fm_user_email', ...clearCookieOpts });
    response.cookies.delete({ name: 'fm_role_expires_at', ...clearCookieOpts });

    return response;
}
