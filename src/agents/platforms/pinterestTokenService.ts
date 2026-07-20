/**
 * Continuous Refresh Token Pinterest API v5.
 * Persiste access/refresh in SystemState; rinnova prima della scadenza.
 */
import prisma from '@/lib/prisma';
import {
    PINTEREST_OAUTH_TOKEN,
    PINTEREST_STATE_KEYS,
    buildPinterestBasicAuthHeader,
    getPinterestAppId,
    getPinterestAppSecret,
    parsePinterestApiError,
    parsePinterestTokenResponse,
    type PinterestTokenResponse,
} from '@/lib/pinterest/oauth';

const REFRESH_SKEW_MS = 5 * 60 * 1000; // rinnova 5 minuti prima della scadenza

export type PinterestTokenBundle = {
    accessToken: string;
    refreshToken: string | null;
    expiresAt: number | null;
};

async function upsertTokenState(tokens: PinterestTokenResponse): Promise<void> {
    const expiresAt = String(Date.now() + tokens.expires_in * 1000);
    const ops = [
        prisma.systemState.upsert({
            where: { key: PINTEREST_STATE_KEYS.accessToken },
            update: { value: tokens.access_token },
            create: { key: PINTEREST_STATE_KEYS.accessToken, value: tokens.access_token },
        }),
        prisma.systemState.upsert({
            where: { key: PINTEREST_STATE_KEYS.refreshToken },
            update: { value: tokens.refresh_token },
            create: { key: PINTEREST_STATE_KEYS.refreshToken, value: tokens.refresh_token },
        }),
        prisma.systemState.upsert({
            where: { key: PINTEREST_STATE_KEYS.expiresAt },
            update: { value: expiresAt },
            create: { key: PINTEREST_STATE_KEYS.expiresAt, value: expiresAt },
        }),
        prisma.systemState.upsert({
            where: { key: PINTEREST_STATE_KEYS.connectedAt },
            update: { value: new Date().toISOString() },
            create: { key: PINTEREST_STATE_KEYS.connectedAt, value: new Date().toISOString() },
        }),
    ];

    if (tokens.refresh_token_expires_in && Number.isFinite(tokens.refresh_token_expires_in)) {
        const refreshExp = String(Date.now() + tokens.refresh_token_expires_in * 1000);
        ops.push(
            prisma.systemState.upsert({
                where: { key: PINTEREST_STATE_KEYS.refreshTokenExpiresAt },
                update: { value: refreshExp },
                create: { key: PINTEREST_STATE_KEYS.refreshTokenExpiresAt, value: refreshExp },
            })
        );
    }

    if (tokens.scope) {
        ops.push(
            prisma.systemState.upsert({
                where: { key: PINTEREST_STATE_KEYS.scope },
                update: { value: tokens.scope },
                create: { key: PINTEREST_STATE_KEYS.scope, value: tokens.scope },
            })
        );
    }

    await prisma.$transaction(ops);
}

/** Scambia authorization code → tokens (callback OAuth). */
export async function exchangePinterestAuthorizationCode(params: {
    code: string;
    redirectUri: string;
}): Promise<PinterestTokenResponse> {
    const appId = getPinterestAppId();
    const appSecret = getPinterestAppSecret();
    if (!appId || !appSecret) {
        throw new Error('PINTEREST_APP_ID / PINTEREST_APP_SECRET non configurati.');
    }

    const res = await fetch(PINTEREST_OAUTH_TOKEN, {
        method: 'POST',
        headers: {
            Authorization: buildPinterestBasicAuthHeader(appId, appSecret),
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: params.code,
            redirect_uri: params.redirectUri,
        }).toString(),
        cache: 'no-store',
    });

    const payload = await res.json().catch(() => null);
    if (!res.ok) {
        throw new Error(parsePinterestApiError(payload) || `Token exchange failed (${res.status})`);
    }

    const tokens = parsePinterestTokenResponse(payload);
    if (!tokens) {
        throw new Error('Risposta token Pinterest non valida.');
    }

    await upsertTokenState(tokens);
    return tokens;
}

async function refreshPinterestAccessToken(refreshToken: string): Promise<PinterestTokenResponse> {
    const appId = getPinterestAppId();
    const appSecret = getPinterestAppSecret();
    if (!appId || !appSecret) {
        throw new Error('PINTEREST_APP_ID / PINTEREST_APP_SECRET mancanti: impossibile fare refresh.');
    }

    // continuous_refresh=true prolunga il refresh token (Pinterest continuous refresh).
    const res = await fetch(PINTEREST_OAUTH_TOKEN, {
        method: 'POST',
        headers: {
            Authorization: buildPinterestBasicAuthHeader(appId, appSecret),
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            continuous_refresh: 'true',
        }).toString(),
        cache: 'no-store',
    });

    const payload = await res.json().catch(() => null);
    if (!res.ok) {
        throw new Error(parsePinterestApiError(payload) || `Refresh token failed (${res.status})`);
    }

    const tokens = parsePinterestTokenResponse(payload);
    if (!tokens) {
        throw new Error('Risposta refresh Pinterest non valida.');
    }

    await upsertTokenState(tokens);
    return tokens;
}

/**
 * Restituisce un access_token valido, rinnovandolo se in scadenza.
 * Fallback: PINTEREST_ACCESS_TOKEN in env (solo bootstrap, senza refresh).
 */
export async function getValidPinterestAccessToken(): Promise<string | null> {
    const bundle = await getOrRefreshPinterestToken();
    return bundle?.accessToken ?? null;
}

export async function getOrRefreshPinterestToken(): Promise<PinterestTokenBundle | null> {
    const [dbAccess, dbRefresh, dbExpires] = await Promise.all([
        prisma.systemState.findUnique({ where: { key: PINTEREST_STATE_KEYS.accessToken } }),
        prisma.systemState.findUnique({ where: { key: PINTEREST_STATE_KEYS.refreshToken } }),
        prisma.systemState.findUnique({ where: { key: PINTEREST_STATE_KEYS.expiresAt } }),
    ]);

    if (!dbAccess?.value?.trim()) {
        const envToken = process.env.PINTEREST_ACCESS_TOKEN?.trim();
        if (envToken) {
            return { accessToken: envToken, refreshToken: null, expiresAt: null };
        }
        return null;
    }

    const expiresAt = Number(dbExpires?.value || '0');
    const refreshToken = dbRefresh?.value?.trim() || null;
    const needsRefresh = !expiresAt || expiresAt - Date.now() < REFRESH_SKEW_MS;

    if (needsRefresh && refreshToken) {
        try {
            console.log('[Pinterest] Access token in scadenza — continuous refresh…');
            const tokens = await refreshPinterestAccessToken(refreshToken);
            return {
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                expiresAt: Date.now() + tokens.expires_in * 1000,
            };
        } catch (err) {
            console.error('[Pinterest] Refresh fallito, uso token memorizzato:', err);
            return {
                accessToken: dbAccess.value,
                refreshToken,
                expiresAt: expiresAt || null,
            };
        }
    }

    return {
        accessToken: dbAccess.value,
        refreshToken,
        expiresAt: expiresAt || null,
    };
}

export async function getPinterestConnectionStatus(): Promise<{
    connected: boolean;
    expiresAt: number | null;
    scope: string | null;
}> {
    const [access, expires, scope] = await Promise.all([
        prisma.systemState.findUnique({ where: { key: PINTEREST_STATE_KEYS.accessToken } }),
        prisma.systemState.findUnique({ where: { key: PINTEREST_STATE_KEYS.expiresAt } }),
        prisma.systemState.findUnique({ where: { key: PINTEREST_STATE_KEYS.scope } }),
    ]);

    return {
        connected: Boolean(access?.value?.trim() || process.env.PINTEREST_ACCESS_TOKEN?.trim()),
        expiresAt: expires?.value ? Number(expires.value) : null,
        scope: scope?.value ?? null,
    };
}
