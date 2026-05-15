import type { NextRequest } from 'next/server';
import { isLocalDevHost } from '@/lib/authCookieDomain';

const DASHBOARD_SUBDOMAIN_ORIGIN = 'https://dashboard.floremoria.com';

/**
 * Abilita redirect www → dashboard.floremoria.com solo quando DNS + certificato SSL
 * sul sottodominio sono pronti. Default: false (dashboard su www…/dashboard).
 */
export function isDashboardSubdomainRoutingEnabled(): boolean {
    return process.env.DASHBOARD_SUBDOMAIN_ENABLED === 'true';
}

export type DashboardHostContext = {
    hostname: string;
    isLocal: boolean;
    isDashboardHost: boolean;
    isPrimaryHost: boolean;
};

/** Origine della richiesta corrente (rispetta x-forwarded-* su Vercel). */
export function getRequestOrigin(request: NextRequest): string {
    const hostRaw = (
        request.headers.get('x-forwarded-host') ||
        request.headers.get('host') ||
        request.nextUrl.host
    )
        .split(',')[0]
        .trim();
    const hostname = hostRaw.split(':')[0].toLowerCase();
    const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0].trim();
    const proto =
        forwardedProto ||
        (isLocalDevHost(hostname) ? request.nextUrl.protocol.replace(':', '') : 'https');
    return `${proto}://${hostRaw}`;
}

/** Origine da usare per login e redirect interni alla dashboard. */
export function getDashboardAppOrigin(request: NextRequest, ctx: DashboardHostContext): string {
    if (ctx.isLocal) {
        return request.nextUrl.origin;
    }
    if (isDashboardSubdomainRoutingEnabled() && ctx.isDashboardHost) {
        return DASHBOARD_SUBDOMAIN_ORIGIN;
    }
    if (ctx.isPrimaryHost) {
        return `https://${ctx.hostname}`;
    }
    return getRequestOrigin(request);
}

export function buildAppUrl(request: NextRequest, ctx: DashboardHostContext, pathname: string): URL {
    return new URL(pathname, getDashboardAppOrigin(request, ctx));
}
