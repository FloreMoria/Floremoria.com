import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getFloremAuthCookieBase, isLocalDevHost } from '@/lib/authCookieDomain';
import {
    buildAppUrl,
    getDashboardAppOrigin,
    isDashboardSubdomainRoutingEnabled,
    type DashboardHostContext,
} from '@/lib/dashboardRouting';

/**
 * Middleware Centrale FloreMoria
 *
 * Sicurezza, RBAC, redirect dashboard (opzionale su sottodominio).
 * Con DASHBOARD_SUBDOMAIN_ENABLED≠true la dashboard resta su www.floremoria.com/dashboard.
 */

function isPartnerApiDocsPath(pathname: string): boolean {
    return (
        pathname === '/docs/partner-api' ||
        pathname.startsWith('/docs/partner-api/') ||
        pathname.startsWith('/api/docs/partner/')
    );
}

function parseBasicAuth(authorization: string | null): { user: string; pass: string } | null {
    if (!authorization?.toLowerCase().startsWith('basic ')) return null;
    try {
        const decoded = atob(authorization.slice(6).trim());
        const colon = decoded.indexOf(':');
        if (colon < 0) return null;
        return { user: decoded.slice(0, colon), pass: decoded.slice(colon + 1) };
    } catch {
        return null;
    }
}

function applyDashboardSecurityHeaders(request: NextRequest, response: NextResponse): NextResponse {
    if (request.nextUrl.pathname.startsWith('/dashboard')) {
        response.headers.set('X-Frame-Options', 'SAMEORIGIN');
        response.headers.set('X-Content-Type-Options', 'nosniff');
    }
    return response;
}

function getHostContext(request: NextRequest): DashboardHostContext {
    const hostFull = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').toLowerCase();
    const hostname = hostFull.split(':')[0];
    const isLocal = isLocalDevHost(hostname);
    const isDashboardHost = !isLocal && hostname === 'dashboard.floremoria.com';
    const isPrimaryHost = !isLocal && (hostname === 'floremoria.com' || hostname === 'www.floremoria.com');
    return { hostname, isLocal, isDashboardHost, isPrimaryHost };
}

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (isPartnerApiDocsPath(pathname)) {
        const expectedUser = process.env.PARTNER_DOCS_BASIC_USER?.trim();
        const expectedPass = process.env.PARTNER_DOCS_BASIC_PASSWORD?.trim();
        if (!expectedUser || !expectedPass) {
            return NextResponse.redirect(new URL('/', request.url), 302);
        }
        const creds = parseBasicAuth(request.headers.get('authorization'));
        if (!creds || creds.user !== expectedUser || creds.pass !== expectedPass) {
            return new NextResponse('Autenticazione richiesta per la documentazione Partner API.', {
                status: 401,
                headers: { 'WWW-Authenticate': 'Basic realm="FloreMoria Partner API"' },
            });
        }
    }

    const hostCtx = getHostContext(request);
    const { isLocal, isDashboardHost, isPrimaryHost } = hostCtx;
    const isApiRoute = pathname.startsWith('/api/');
    const isStaticAsset = pathname.startsWith('/_next/') || pathname.startsWith('/images/') || pathname.includes('.');

    // Redirect verso sottodominio solo se esplicitamente abilitato (DNS + SSL pronti).
    if (!isLocal && isDashboardSubdomainRoutingEnabled()) {
        if (isPrimaryHost && pathname.startsWith('/dashboard')) {
            const dest = new URL(
                request.nextUrl.pathname + request.nextUrl.search,
                'https://dashboard.floremoria.com'
            );
            return applyDashboardSecurityHeaders(request, NextResponse.redirect(dest, 307));
        }

        if (isDashboardHost && pathname === '/') {
            const dest = new URL('/dashboard', 'https://dashboard.floremoria.com');
            return applyDashboardSecurityHeaders(request, NextResponse.redirect(dest, 307));
        }

        if (
            isDashboardHost &&
            !pathname.startsWith('/dashboard') &&
            pathname !== '/login' &&
            !isApiRoute &&
            !isStaticAsset
        ) {
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

    const loginUrl = buildAppUrl(request, hostCtx, '/login?expired=1');

    if (roleExpiresAt) {
        if (new Date() > new Date(roleExpiresAt)) {
            const response = NextResponse.redirect(loginUrl, 307);
            clearAuthCookies(response);
            return applyDashboardSecurityHeaders(request, response);
        }
    }

    if (pathname.startsWith('/dashboard')) {
        const dashboardOrigin = getDashboardAppOrigin(request, hostCtx);

        if (!userRole) {
            return applyDashboardSecurityHeaders(
                request,
                NextResponse.redirect(buildAppUrl(request, hostCtx, '/login'), 307)
            );
        }

        if (userRole === 'SUPER_ADMIN') {
            return applyDashboardSecurityHeaders(request, NextResponse.next());
        }

        const dashboardHome = isLocal
            ? new URL('/dashboard', request.nextUrl.origin)
            : new URL('/dashboard', dashboardOrigin);

        if (userRole === 'OPERATOR') {
            if (pathname.startsWith('/dashboard/orders') || pathname === '/dashboard') {
                return applyDashboardSecurityHeaders(request, NextResponse.next());
            }
            return applyDashboardSecurityHeaders(request, NextResponse.redirect(dashboardHome, 307));
        }

        if (userRole === 'PARTNER_FLORIST') {
            if (pathname.startsWith('/dashboard/orders') || pathname === '/dashboard') {
                return applyDashboardSecurityHeaders(request, NextResponse.next());
            }
            return applyDashboardSecurityHeaders(request, NextResponse.redirect(dashboardHome, 307));
        }

        if (userRole === 'MARKETING_MANAGER') {
            if (pathname.startsWith('/dashboard/blog') || pathname === '/dashboard') {
                return applyDashboardSecurityHeaders(request, NextResponse.next());
            }
            return applyDashboardSecurityHeaders(request, NextResponse.redirect(dashboardHome, 307));
        }

        return applyDashboardSecurityHeaders(
            request,
            NextResponse.redirect(buildAppUrl(request, hostCtx, '/login'), 307)
        );
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
