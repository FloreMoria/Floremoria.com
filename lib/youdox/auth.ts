/**
 * Autenticazione YouDOX — GetToken.aspx (JSON), stile OAuth 2.0 password+client_id.
 * Il token va passato ai metodi SOAP autorizzati (parametro di input, non header WS-Security).
 */

import type { YoudoxConfig, YoudoxTokenError, YoudoxTokenResponse } from './types';

export function loadYoudoxConfigFromEnv(): YoudoxConfig | null {
    const apiBaseUrl = process.env.YOUDOX_API_BASE_URL?.trim();
    const tokenUrl = process.env.YOUDOX_TOKEN_URL?.trim();
    const clientId = process.env.YOUDOX_CLIENT_ID?.trim();
    const username = process.env.YOUDOX_USERNAME?.trim();
    const password = process.env.YOUDOX_PASSWORD?.trim();

    if (!apiBaseUrl || !tokenUrl || !clientId || !username || !password) {
        return null;
    }

    return {
        apiBaseUrl: apiBaseUrl.replace(/\/$/, ''),
        tokenUrl,
        clientId,
        username,
        password,
        sftpHost: process.env.YOUDOX_SFTP_HOST?.trim() || undefined,
        sftpUser: process.env.YOUDOX_SFTP_USER?.trim() || undefined,
        sftpPort: process.env.YOUDOX_SFTP_PORT
            ? Number(process.env.YOUDOX_SFTP_PORT)
            : 22,
    };
}

type CachedToken = { token: string; expiresAtMs: number };

let cached: CachedToken | null = null;

/**
 * Ottiene access_token (cache in-memory con margine 60s).
 */
export async function getYoudoxAccessToken(config: YoudoxConfig): Promise<string> {
    const now = Date.now();
    if (cached && cached.expiresAtMs > now + 60_000) {
        return cached.token;
    }

    const body = new URLSearchParams({
        username: config.username,
        password: config.password,
        client_id: config.clientId,
    });

    const res = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
        },
        body,
    });

    const json = (await res.json()) as YoudoxTokenResponse | YoudoxTokenError;
    if (!res.ok || 'error' in json) {
        const err = json as YoudoxTokenError;
        throw new Error(
            `[youdox] GetToken fallito: ${err.error || res.status} ${err.error_message || ''}`.trim()
        );
    }

    const ok = json as YoudoxTokenResponse;
    if (!ok.access_token) {
        throw new Error('[youdox] GetToken: access_token assente nella risposta');
    }

    cached = {
        token: ok.access_token,
        expiresAtMs: now + Math.max(60, Number(ok.expires_in) || 3600) * 1000,
    };
    return cached.token;
}

export function clearYoudoxTokenCache(): void {
    cached = null;
}
