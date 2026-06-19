import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getFloremAuthCookieBase, isLocalDevHost } from '@/lib/authCookieDomain';
import {
    buildAppUrl,
    getDashboardAppOrigin,
    isDashboardSubdomainRoutingEnabled,
    type DashboardHostContext,
} from '@/lib/dashboardRouting';
import { isSuperAdminRole, isDashboardAdminRole } from '@/lib/superAdmin';
import { hasValidAdminApiKeyHeader } from '@/lib/auth/verbaleSyncAuth';

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
    const { pathname } = request.nextUrl;
    if (pathname.startsWith('/dashboard') || pathname.startsWith('/admin-panel')) {
        response.headers.set('X-Frame-Options', 'SAMEORIGIN');
        response.headers.set('X-Content-Type-Options', 'nosniff');
    }
    return response;
}

function isSuperAdminOnlyPath(pathname: string): boolean {
    return (
        pathname.startsWith('/admin-panel') ||
        pathname.startsWith('/dashboard/settings/roles') ||
        pathname.startsWith('/api/admin/')
    );
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

    if (isSuperAdminOnlyPath(pathname)) {
        if (pathname.startsWith('/api/admin/') && hasValidAdminApiKeyHeader(request.headers.get('x-admin-key'))) {
            return NextResponse.next();
        }
        if (!userRole) {
            if (pathname.startsWith('/api/admin/')) {
                return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });
            }
            return applyDashboardSecurityHeaders(
                request,
                NextResponse.redirect(buildAppUrl(request, hostCtx, '/login'), 307)
            );
        }
        if (!isSuperAdminRole(userRole)) {
            if (pathname.startsWith('/api/admin/')) {
                return NextResponse.json({ error: 'Accesso riservato al Super Admin.' }, { status: 403 });
            }
            return applyDashboardSecurityHeaders(
                request,
                NextResponse.redirect(buildAppUrl(request, hostCtx, '/dashboard'), 307)
            );
        }
        if (pathname.startsWith('/admin-panel') || pathname.startsWith('/api/admin/')) {
            return applyDashboardSecurityHeaders(request, NextResponse.next());
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

        // Domain Isolation: gli utenti finali (USER) possono accedere SOLO alla bacheca cliente /dashboard/user
        if (userRole === 'USER') {
            if (pathname === '/dashboard/user' || pathname.startsWith('/dashboard/user/')) {
                return applyDashboardSecurityHeaders(request, NextResponse.next());
            }
            return applyDashboardSecurityHeaders(
                request,
                NextResponse.redirect(new URL('/dashboard/user', request.url), 307)
            );
        }

        // Inibisce l'accesso a /dashboard/user per lo staff operativo (non ADMIN di sistema).
        if (pathname === '/dashboard/user' || pathname.startsWith('/dashboard/user/')) {
            if (isDashboardAdminRole(userRole)) {
                return applyDashboardSecurityHeaders(request, NextResponse.next());
            }
            const dashboardHome = isLocal
                ? new URL('/dashboard', request.nextUrl.origin)
                : new URL('/dashboard', dashboardOrigin);
            return applyDashboardSecurityHeaders(request, NextResponse.redirect(dashboardHome, 307));
        }

        if (userRole === 'SUPER_ADMIN' || userRole === 'ADMIN') {
            return applyDashboardSecurityHeaders(request, NextResponse.next());
        }

        const dashboardHome = isLocal
            ? new URL('/dashboard', request.nextUrl.origin)
            : new URL('/dashboard', dashboardOrigin);

        const ordersAccessRoles = ['STAKEHOLDER', 'ACCOUNTANT', 'OPERATOR', 'FLORIST', 'AGENCY', 'MUNICIPALITY'];
        
        if (ordersAccessRoles.includes(userRole)) {
            if (pathname.startsWith('/dashboard/orders') || pathname === '/dashboard' || pathname.startsWith('/dashboard/profile')) {
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
        '/admin-panel/:path*',
        '/api/admin/:path*',
        '/',
        '/login',
        '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
    ],
};
