import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getFloremAuthCookieBase, isLocalDevHost } from '@/lib/authCookieDomain';

/**
 * Middleware Centrale FloreMoria
 *
 * Sicurezza, RBAC, redirect www ↔ dashboard (Vercel / produzione).
 * In locale (localhost) nessun redirect verso i domini .com.
 */

function applyDashboardSecurityHeaders(request: NextRequest, response: NextResponse): NextResponse {
    if (request.nextUrl.pathname.startsWith('/dashboard')) {
        response.headers.set('X-Frame-Options', 'SAMEORIGIN');
        response.headers.set('X-Content-Type-Options', 'nosniff');
    }
    return response;
}

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const hostFull = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').toLowerCase();
    const hostname = hostFull.split(':')[0];
    const isLocal = isLocalDevHost(hostname);
    const isApiRoute = pathname.startsWith('/api/');
    const isStaticAsset = pathname.startsWith('/_next/') || pathname.startsWith('/images/') || pathname.includes('.');

    const isDashboardHost = !isLocal && hostname === 'dashboard.floremoria.com';
    const isPrimaryHost = !isLocal && (hostname === 'floremoria.com' || hostname === 'www.floremoria.com');

    // In locale: nessun redirect forzato tra domini produzione.
    if (!isLocal) {
        // Domain routing dashboard: /dashboard sul sito principale → sottodominio dedicato (sempre HTTPS).
        if (isPrimaryHost && pathname.startsWith('/dashboard')) {
            const dest = new URL(request.nextUrl.pathname + request.nextUrl.search, 'https://dashboard.floremoria.com');
            return applyDashboardSecurityHeaders(request, NextResponse.redirect(dest, 307));
        }

        // Sul sottodominio dashboard, root → /dashboard (HTTPS esplicito).
        if (isDashboardHost && pathname === '/') {
            const dest = new URL('/dashboard', 'https://dashboard.floremoria.com');
            return applyDashboardSecurityHeaders(request, NextResponse.redirect(dest, 307));
        }

        // Sul sottodominio dashboard: blocca pagine pubbliche fuori da dashboard/login/api.
        if (isDashboardHost && !pathname.startsWith('/dashboard') && pathname !== '/login' && !isApiRoute && !isStaticAsset) {
            const dest = new URL('/dashboard', 'https://dashboard.floremoria.com');
            return applyDashboardSecurityHeaders(request, NextResponse.redirect(dest, 307));
        }
    }

    const userRole = request.cookies.get('fm_user_role')?.value;
    const roleExpiresAt = request.cookies.get('fm_role_expires_at')?.value;
    const cookieBase = getFloremAuthCookieBase({
        headers: request.headers,
        url: request.nextUrl.href,
    });

    const clearAuthCookies = (res: NextResponse) => {
        res.cookies.delete({
            name: 'fm_user_role',
            path: cookieBase.path,
            ...(cookieBase.domain ? { domain: cookieBase.domain } : {}),
        });
        res.cookies.delete({
            name: 'fm_role_expires_at',
            path: cookieBase.path,
            ...(cookieBase.domain ? { domain: cookieBase.domain } : {}),
        });
        return res;
    };

    const loginUrl = (() => {
        if (isLocal) {
            return new URL('/login?expired=1', request.nextUrl.origin);
        }
        if (isDashboardHost) {
            return new URL('/login?expired=1', 'https://dashboard.floremoria.com');
        }
        if (isPrimaryHost) {
            return new URL('/login?expired=1', `https://${hostname}`);
        }
        return new URL('/login?expired=1', request.nextUrl.origin);
    })();

    if (roleExpiresAt) {
        if (new Date() > new Date(roleExpiresAt)) {
            const response = NextResponse.redirect(loginUrl, 307);
            clearAuthCookies(response);
            return applyDashboardSecurityHeaders(request, response);
        }
    }

    if (pathname.startsWith('/dashboard')) {
        if (!userRole) {
            const dest = isLocal
                ? new URL('/login', request.nextUrl.origin)
                : isDashboardHost
                  ? new URL('/login', 'https://dashboard.floremoria.com')
                  : isPrimaryHost
                    ? new URL('/login', `https://${hostname}`)
                    : new URL('/login', request.nextUrl.origin);
            return applyDashboardSecurityHeaders(request, NextResponse.redirect(dest, 307));
        }

        if (userRole === 'SUPER_ADMIN') {
            return applyDashboardSecurityHeaders(request, NextResponse.next());
        }

        if (userRole === 'OPERATOR') {
            if (pathname.startsWith('/dashboard/orders') || pathname === '/dashboard') {
                return applyDashboardSecurityHeaders(request, NextResponse.next());
            }
            const dest = isLocal
                ? new URL('/dashboard', request.nextUrl.origin)
                : new URL('/dashboard', 'https://dashboard.floremoria.com');
            return applyDashboardSecurityHeaders(request, NextResponse.redirect(dest, 307));
        }

        if (userRole === 'PARTNER_FLORIST') {
            if (pathname.startsWith('/dashboard/orders') || pathname === '/dashboard') {
                return applyDashboardSecurityHeaders(request, NextResponse.next());
            }
            const dest = isLocal
                ? new URL('/dashboard', request.nextUrl.origin)
                : new URL('/dashboard', 'https://dashboard.floremoria.com');
            return applyDashboardSecurityHeaders(request, NextResponse.redirect(dest, 307));
        }

        if (userRole === 'MARKETING_MANAGER') {
            if (pathname.startsWith('/dashboard/blog') || pathname === '/dashboard') {
                return applyDashboardSecurityHeaders(request, NextResponse.next());
            }
            const dest = isLocal
                ? new URL('/dashboard', request.nextUrl.origin)
                : new URL('/dashboard', 'https://dashboard.floremoria.com');
            return applyDashboardSecurityHeaders(request, NextResponse.redirect(dest, 307));
        }

        const dest = isLocal
            ? new URL('/login', request.nextUrl.origin)
            : isDashboardHost
              ? new URL('/login', 'https://dashboard.floremoria.com')
              : isPrimaryHost
                ? new URL('/login', `https://${hostname}`)
                : new URL('/login', request.nextUrl.origin);
        return applyDashboardSecurityHeaders(request, NextResponse.redirect(dest, 307));
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/dashboard/:path*',
        '/',
        '/login',
        '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
    ],
};
