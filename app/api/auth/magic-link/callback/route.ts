import { NextResponse } from 'next/server';
import { getFloremAuthCookieBase } from '@/lib/authCookieDomain';
import { UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';
import {
    isLikelyEmailLinkScanner,
    sanitizeMagicLinkToken,
    verifyMagicLinkTokenDetailed,
} from '@/lib/auth/magicLink';
import { findUserByEmail } from '@/lib/auth/identity';
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

    const normalizedEmail = email.trim().toLowerCase();
    response.cookies.set({
        name: 'fm_user_email',
        value: normalizedEmail,
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

function scannerHoldPage(token: string, baseUrl: string): NextResponse {
    // Perché: Outlook/Gmail SafeLinks fanno GET automatici; senza cookie di sessione
    // e con pagina di conferma, il token resta valido per il click umano.
    const confirmUrl = `${baseUrl}/auth/magic-link?token=${encodeURIComponent(token)}`;
    const html = `<!DOCTYPE html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Conferma accesso — FloreMoria</title></head>
<body style="font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#FAF9F6;margin:0;">
  <div style="max-width:420px;padding:28px;background:#fff;border-radius:16px;border:1px solid #e2e8f0;text-align:center;">
    <p style="letter-spacing:0.2em;font-size:11px;color:#c5a880;text-transform:uppercase;font-weight:700;">FloreMoria</p>
    <h1 style="font-size:20px;color:#0f172a;">Conferma l'accesso</h1>
    <p style="color:#475569;font-size:14px;line-height:1.5;">Per sicurezza, apri questo collegamento nel browser e conferma l'accesso.</p>
    <a href="${confirmUrl}" style="display:inline-block;margin-top:18px;background:#0f172a;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;">Continua</a>
  </div>
</body></html>`;
    return new NextResponse(html, {
        status: 200,
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
        },
    });
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const token = sanitizeMagicLinkToken(searchParams.get('token') || '');
    const baseUrl = getSiteBaseUrl();

    if (!token) {
        return NextResponse.redirect(`${baseUrl}/login?error=magic_link_invalid`);
    }

    const ua = request.headers.get('user-agent');
    if (isLikelyEmailLinkScanner(ua)) {
        console.info('[magic-link-callback] Scanner email intercettato (nessuna sessione impostata).');
        return scannerHoldPage(token, baseUrl);
    }

    const verified = verifyMagicLinkTokenDetailed(token);
    if (!verified.ok) {
        const err = verified.reason === 'expired' ? 'magic_link_expired' : 'magic_link_invalid';
        return NextResponse.redirect(`${baseUrl}/login?error=${err}`);
    }

    try {
        let user = await findUserByEmail(verified.email);

        if (!user) {
            user = await prisma.user.create({
                data: {
                    email: verified.email.trim().toLowerCase(),
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
        console.error('[magic-link-callback] Errore di connessione o Prisma:', error);
        return NextResponse.redirect(`${baseUrl}/login?error=server_error`);
    }
}
