/**
 * Cookie di sessione dashboard condivisi tra www e dashboard su produzione.
 * Su localhost / 127.0.0.1 non impostiamo `domain` così i cookie restano sul solo host di dev.
 */

export type FloremAuthCookieBase = {
    path: '/';
    domain?: string;
    secure: boolean;
    sameSite: 'lax';
};

function hostnameFromRequest(request: { headers: Headers; url?: string }): string {
    const h =
        request.headers.get('x-forwarded-host') ||
        request.headers.get('host') ||
        (request.url ? new URL(request.url).host : '') ||
        '';
    return h.split(':')[0].toLowerCase();
}

export function isLocalDevHost(hostname: string): boolean {
    return (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '0.0.0.0' ||
        hostname.endsWith('.local')
    );
}

/** true se siamo su floremoria.com / *.floremoria.com (produzione / staging su quel dominio). */
export function isFloremoriaProductionHost(hostname: string): boolean {
    return hostname === 'floremoria.com' || hostname.endsWith('.floremoria.com');
}

/**
 * Opzioni base per `fm_user_role` / `fm_role_expires_at` (set + delete coerenti).
 */
export function getFloremAuthCookieBase(request: { headers: Headers; url: string }): FloremAuthCookieBase {
    const hostname = hostnameFromRequest(request);
    if (isLocalDevHost(hostname)) {
        return { path: '/', secure: false, sameSite: 'lax' };
    }
    if (isFloremoriaProductionHost(hostname)) {
        return {
            path: '/',
            domain: '.floremoria.com',
            secure: true,
            sameSite: 'lax',
        };
    }
    // Vercel preview (*.vercel.app) o altri host: cookie host-only, HTTPS se la richiesta è sicura.
    const proto = request.headers.get('x-forwarded-proto');
    const secure = proto === 'https' || process.env.VERCEL === '1';
    return { path: '/', secure, sameSite: 'lax' };
}
