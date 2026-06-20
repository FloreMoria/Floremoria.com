import { NextResponse } from 'next/server';
import { getFloremAuthCookieBase } from '@/lib/authCookieDomain';

/** Aggiorna il cookie di sessione dopo cambio email profilo. */
export function applySessionEmailCookie(response: NextResponse, request: Request, newEmail: string): void {
    const base = getFloremAuthCookieBase({ headers: request.headers, url: request.url });
    response.cookies.set({
        name: 'fm_user_email',
        value: newEmail.trim().toLowerCase(),
        httpOnly: true,
        path: base.path,
        ...(base.domain ? { domain: base.domain } : {}),
        secure: base.secure,
        sameSite: base.sameSite,
        maxAge: 60 * 60 * 24 * 7,
    });
}
