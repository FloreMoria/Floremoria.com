/**
 * Config e helper OAuth Pinterest API v5.
 * Secrets solo da env — mai in repo.
 */
export const PINTEREST_API_BASE = 'https://api.pinterest.com/v5';
export const PINTEREST_OAUTH_AUTHORIZE = 'https://www.pinterest.com/oauth/';
export const PINTEREST_OAUTH_TOKEN = 'https://api.pinterest.com/v5/oauth/token';

export const PINTEREST_DEFAULT_SCOPES =
    'boards:read,boards:write,pins:read,pins:write,user_accounts:read';

export const PINTEREST_STATE_KEYS = {
    accessToken: 'pinterest_access_token',
    refreshToken: 'pinterest_refresh_token',
    expiresAt: 'pinterest_token_expires_at',
    refreshTokenExpiresAt: 'pinterest_refresh_token_expires_at',
    scope: 'pinterest_granted_scopes',
    connectedAt: 'pinterest_connected_at',
} as const;

export function getPinterestAppId(): string | null {
    return process.env.PINTEREST_APP_ID?.trim() || null;
}

export function getPinterestAppSecret(): string | null {
    return process.env.PINTEREST_APP_SECRET?.trim() || null;
}

/** Redirect URI esplicita da env, altrimenti produzione FloreMoria. */
export function getPinterestRedirectUri(request?: Request): string {
    const fromEnv = process.env.PINTEREST_REDIRECT_URI?.trim();
    if (fromEnv) return fromEnv;

    if (request) {
        const url = new URL(request.url);
        const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
        if (isLocal) {
            return `${url.origin}/api/auth/pinterest/callback`;
        }
    }

    return 'https://www.floremoria.com/api/auth/pinterest/callback';
}

export function getPinterestOAuthScopes(): string {
    return process.env.PINTEREST_OAUTH_SCOPES?.trim() || PINTEREST_DEFAULT_SCOPES;
}

export function getPinterestDefaultBoardId(): string | null {
    return process.env.PINTEREST_BOARD_ID?.trim() || null;
}

/** Basic Auth header: base64(app_id:app_secret) */
export function buildPinterestBasicAuthHeader(appId: string, appSecret: string): string {
    const encoded = Buffer.from(`${appId}:${appSecret}`, 'utf8').toString('base64');
    return `Basic ${encoded}`;
}

export function buildPinterestAuthorizeUrl(params: {
    clientId: string;
    redirectUri: string;
    scope: string;
    state?: string;
}): string {
    const url = new URL(PINTEREST_OAUTH_AUTHORIZE);
    url.searchParams.set('client_id', params.clientId);
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', params.scope);
    if (params.state) {
        url.searchParams.set('state', params.state);
    }
    return url.toString();
}

export type PinterestTokenResponse = {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    refresh_token_expires_in?: number;
    scope?: string;
    token_type?: string;
    response_type?: string;
};

export function parsePinterestTokenResponse(payload: unknown): PinterestTokenResponse | null {
    if (!payload || typeof payload !== 'object') return null;
    const p = payload as Record<string, unknown>;
    const access_token = typeof p.access_token === 'string' ? p.access_token.trim() : '';
    const refresh_token = typeof p.refresh_token === 'string' ? p.refresh_token.trim() : '';
    const expires_in = Number(p.expires_in);
    if (!access_token || !refresh_token || !Number.isFinite(expires_in) || expires_in <= 0) {
        return null;
    }
    return {
        access_token,
        refresh_token,
        expires_in,
        refresh_token_expires_in:
            typeof p.refresh_token_expires_in === 'number'
                ? p.refresh_token_expires_in
                : Number(p.refresh_token_expires_in) || undefined,
        scope: typeof p.scope === 'string' ? p.scope : undefined,
        token_type: typeof p.token_type === 'string' ? p.token_type : undefined,
        response_type: typeof p.response_type === 'string' ? p.response_type : undefined,
    };
}

export function parsePinterestApiError(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') return null;
    const p = payload as Record<string, unknown>;
    if (typeof p.message === 'string' && p.message.trim()) return p.message.trim();
    if (typeof p.error === 'string' && p.error.trim()) return p.error.trim();
    const code = p.code ?? p.error_code;
    if (code != null) return `Pinterest API error ${String(code)}`;
    return null;
}
