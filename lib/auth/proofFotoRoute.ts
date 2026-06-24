/**
 * Handler condiviso per /f/{code}, /f/o/… e /foto/{token}:
 * link valido → account silenzioso + sessione; scaduto → auto-login se riconosciuto, altrimenti /login.
 */
import { NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';
import { getFloremAuthCookieBase } from '@/lib/authCookieDomain';
import { ensureUserForOrder } from '@/lib/auth/ensureOrderUser';
import { recordMemoryGardenOpen } from '@/lib/memoryGarden/trackOpen';
import { getSiteBaseUrl } from '@/lib/futuria/config';
import { USER_SESSION_TTL_MS } from '@/lib/auth/proofFotoAccess';
import { getValidUserSessionFromRequest } from '@/lib/auth/userSessionFromRequest';

function setUserSessionCookies(
    response: NextResponse,
    request: Request,
    email: string,
    expiresAt: Date
): void {
    const base = getFloremAuthCookieBase({ headers: request.headers, url: request.url });
    const maxAgeSeconds = Math.floor(USER_SESSION_TTL_MS / 1000);
    const opts = {
        httpOnly: true,
        path: base.path,
        ...(base.domain ? { domain: base.domain } : {}),
        secure: base.secure,
        sameSite: base.sameSite as 'lax' | 'strict' | 'none',
        maxAge: maxAgeSeconds,
    };

    response.cookies.set({ ...opts, name: 'fm_user_role', value: UserRole.USER });
    response.cookies.set({ ...opts, name: 'fm_user_email', value: email });
    response.cookies.set({ ...opts, name: 'fm_role_expires_at', value: expiresAt.toISOString() });
}

function buildLoginRedirectUrl(params: {
    error: 'proof_foto_invalid' | 'proof_foto_expired';
    email?: string | null;
    phone?: string | null;
    highlightOrderId?: string;
}): string {
    const baseUrl = getSiteBaseUrl();
    const url = new URL('/login', baseUrl);
    url.searchParams.set('error', params.error);
    if (params.email) url.searchParams.set('email', params.email);
    if (params.phone) url.searchParams.set('phone', params.phone);
    if (params.highlightOrderId) url.searchParams.set('order', params.highlightOrderId);
    return url.toString();
}

function redirectToUserDashboard(orderId: string): NextResponse {
    const baseUrl = getSiteBaseUrl();
    return NextResponse.redirect(
        `${baseUrl}/dashboard/user?highlight=${encodeURIComponent(orderId)}`
    );
}

async function userOwnsOrder(email: string, orderId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
        where: { email: email.trim().toLowerCase() },
        select: { id: true, systemRole: true, email: true },
    });
    if (!user || user.systemRole !== UserRole.USER) return false;

    const order = await prisma.order.findFirst({
        where: {
            id: orderId,
            OR: [{ userId: user.id }, { buyerEmail: user.email }],
        },
        select: { id: true },
    });
    return Boolean(order);
}

/** Link scaduto: sessione attiva → bacheca; altrimenti login passwordless (nessuna registrazione). */
export async function handleProofFotoExpiredAccess(
    request: Request,
    orderId: string,
    hints?: { buyerEmail?: string | null; customerPhone?: string | null }
): Promise<NextResponse> {
    const session = getValidUserSessionFromRequest(request);
    if (session && (await userOwnsOrder(session.email, orderId))) {
        return redirectToUserDashboard(orderId);
    }

    const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { buyerEmail: true, customerPhone: true },
    });

    return NextResponse.redirect(
        buildLoginRedirectUrl({
            error: 'proof_foto_expired',
            email: hints?.buyerEmail || order?.buyerEmail,
            phone: hints?.customerPhone || order?.customerPhone,
            highlightOrderId: orderId,
        })
    );
}

export async function handleProofFotoAccess(
    request: Request,
    orderId: string
): Promise<NextResponse> {
    const errorUrl = buildLoginRedirectUrl({ error: 'proof_foto_invalid' });

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
        return NextResponse.redirect(errorUrl);
    }

    const user = await ensureUserForOrder(order);
    if (!user || user.systemRole !== UserRole.USER) {
        return NextResponse.redirect(errorUrl);
    }

    void recordMemoryGardenOpen(order.id, request, {
        email: user.email,
        name: user.name || order.buyerFullName,
    });

    const expiresAt = new Date(Date.now() + USER_SESSION_TTL_MS);
    const redirectUrl = `${getSiteBaseUrl()}/dashboard/user?highlight=${encodeURIComponent(order.id)}`;
    const response = NextResponse.redirect(redirectUrl);
    setUserSessionCookies(response, request, user.email, expiresAt);

    await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
    });

    return response;
}
