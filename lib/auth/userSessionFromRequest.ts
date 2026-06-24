/**
 * Lettura sessione USER da cookie su Route Handler (senza next/headers).
 */

export interface ValidUserSession {
    role: 'USER';
    email: string;
    expiresAt: Date | null;
}

function parseCookieHeader(header: string | null): Record<string, string> {
    const out: Record<string, string> = {};
    if (!header) return out;
    for (const part of header.split(';')) {
        const eq = part.indexOf('=');
        if (eq <= 0) continue;
        const key = part.slice(0, eq).trim();
        const value = part.slice(eq + 1).trim();
        if (key) out[key] = decodeURIComponent(value);
    }
    return out;
}

/** Sessione USER valida (ruolo + email + non scaduta). */
export function getValidUserSessionFromRequest(request: Request): ValidUserSession | null {
    const cookies = parseCookieHeader(request.headers.get('cookie'));
    const role = cookies.fm_user_role?.trim();
    const email = cookies.fm_user_email?.trim().toLowerCase();
    const expiresRaw = cookies.fm_role_expires_at?.trim();

    if (role !== 'USER' || !email) return null;

    let expiresAt: Date | null = null;
    if (expiresRaw) {
        const parsed = new Date(expiresRaw);
        if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
            return null;
        }
        expiresAt = parsed;
    }

    return { role: 'USER', email, expiresAt };
}
