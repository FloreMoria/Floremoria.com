/**
 * Handler condiviso per /f/{code} e /foto/{token}: sessione USER + redirect bacheca.
 */
import { NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';
import { getFloremAuthCookieBase } from '@/lib/authCookieDomain';
import { ensureUserForOrder } from '@/lib/auth/ensureOrderUser';
import { getSiteBaseUrl } from '@/lib/futuria/config';

function setUserSessionCookies(
    response: NextResponse,
    request: Request,
    email: string,
    expiresAt: Date
): void {
    const base = getFloremAuthCookieBase({ headers: request.headers, url: request.url });
    const opts = {
        httpOnly: true,
        path: base.path,
        ...(base.domain ? { domain: base.domain } : {}),
        secure: base.secure,
        sameSite: base.sameSite as 'lax' | 'strict' | 'none',
        maxAge: 60 * 60 * 24 * 7,
    };

    response.cookies.set({ ...opts, name: 'fm_user_role', value: UserRole.USER });
    response.cookies.set({ ...opts, name: 'fm_user_email', value: email });
    response.cookies.set({ ...opts, name: 'fm_role_expires_at', value: expiresAt.toISOString() });
}

export async function handleProofFotoAccess(
    request: Request,
    orderId: string
): Promise<NextResponse> {
    const baseUrl = getSiteBaseUrl();
    const errorUrl = `${baseUrl}/login?error=proof_foto_invalid`;

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
        return NextResponse.redirect(errorUrl);
    }

    const user = await ensureUserForOrder(order);
    if (!user || user.systemRole !== UserRole.USER) {
        return NextResponse.redirect(errorUrl);
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const redirectUrl = `${baseUrl}/dashboard/user?highlight=${encodeURIComponent(order.id)}`;
    const response = NextResponse.redirect(redirectUrl);
    setUserSessionCookies(response, request, user.email, expiresAt);

    await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
    });

    return response;
}
