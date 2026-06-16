/**
 * Atterraggio Magic Link foto consegna (24h): sessione USER + redirect bacheca ordini.
 */
import { NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';
import { getFloremAuthCookieBase } from '@/lib/authCookieDomain';
import { ensureUserForOrder } from '@/lib/auth/ensureOrderUser';
import { getSiteBaseUrl } from '@/lib/futuria/config';
import { verifyMagicPhotoDeliveryToken } from '@/lib/auth/magicPhotoDelivery';

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

export async function handleMagicPhotoAccess(request: Request, token: string): Promise<NextResponse> {
    const baseUrl = getSiteBaseUrl();
    const expiredUrl = `${baseUrl}/auth/magic-photo?expired=1`;
    const invalidUrl = `${baseUrl}/auth/magic-photo?invalid=1`;

    const verified = verifyMagicPhotoDeliveryToken(token);
    if (!verified) {
        return NextResponse.redirect(invalidUrl);
    }
    if ('expired' in verified) {
        return NextResponse.redirect(expiredUrl);
    }

    const order = await prisma.order.findUnique({ where: { id: verified.orderId } });
    if (!order) {
        return NextResponse.redirect(invalidUrl);
    }

    const user = await ensureUserForOrder(order);
    if (!user || user.systemRole !== UserRole.USER) {
        return NextResponse.redirect(invalidUrl);
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const redirectUrl = `${baseUrl}/profile/orders?orderId=${encodeURIComponent(order.id)}`;
    const response = NextResponse.redirect(redirectUrl);
    setUserSessionCookies(response, request, user.email, expiresAt);

    await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
    });

    return response;
}
