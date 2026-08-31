/**
 * Autenticazione YouDOX — GetToken.aspx (JSON), stile OAuth 2.0 password+client_id.
 * Il token va passato ai metodi SOAP autorizzati (parametro di input, non header WS-Security).
 */

import type { YoudoxConfig, YoudoxTokenError, YoudoxTokenResponse } from './types';
import { YOUDOX_ER05_USER_MESSAGE, YoudoxAuthError } from './types';

export { YOUDOX_ER05_USER_MESSAGE, YoudoxAuthError } from './types';

export function loadYoudoxConfigFromEnv(): YoudoxConfig | null {
    const endpoint =
        process.env.YOUDOX_ENDPOINT?.trim() ||
        process.env.YOUDOX_API_BASE_URL?.trim() ||
        'https://servizi-demo.youdox.it/fatturazione/api';
    const apiBaseUrl = endpoint.replace(/\/$/, '');
    const tokenUrl = (
        process.env.YOUDOX_TOKEN_URL?.trim() ||
        `${apiBaseUrl.replace(/\/api$/, '')}/GetToken.aspx`
    ).trim();
    const clientId = process.env.YOUDOX_CLIENT_ID?.trim();
    const username = process.env.YOUDOX_USERNAME?.trim();
    const password = process.env.YOUDOX_PASSWORD?.trim();

    if (!clientId || !username || !password) {
        return null;
    }

    return {
        apiBaseUrl,
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

function isYoudoxEr05(errorCode: string, errorMessage: string): boolean {
    const code = errorCode.trim().toUpperCase();
    const msg = errorMessage.trim().toLowerCase();
    return (
        code === 'ER05' ||
        msg.includes('er05') ||
        msg.includes('access is denied due to invalid credentials') ||
        msg.includes('invalid credentials')
    );
}

/**
 * Ottiene access_token (cache in-memory con margine 60s).
 */
export async function getYoudoxAccessToken(config: YoudoxConfig): Promise<string> {
    const now = Date.now();
    if (cached && cached.expiresAtMs > now + 60_000) {
        return cached.token;
    }

    const username = config.username.trim();
    const password = config.password.trim();
    const clientId = config.clientId.trim();
    const tokenUrl = config.tokenUrl.trim();

    const body = new URLSearchParams({
        username,
        password,
        client_id: clientId,
    });

    const res = await fetch(tokenUrl, {
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
        const errorCode = String(err.error || '').trim();
        const errorMessage = String(err.error_message || '').trim();
        if (isYoudoxEr05(errorCode, errorMessage)) {
            throw new YoudoxAuthError(YOUDOX_ER05_USER_MESSAGE, 'ER05');
        }
        throw new Error(
            `[youdox] GetToken fallito: ${errorCode || res.status} ${errorMessage}`.trim()
        );
    }

    const ok = json as YoudoxTokenResponse;
    if (!ok.access_token) {
        throw new Error('[youdox] GetToken: access_token assente nella risposta');
    }

    cached = {
        token: ok.access_token.trim(),
        expiresAtMs: now + Math.max(60, Number(ok.expires_in) || 3600) * 1000,
    };
    return cached.token;
}

export function clearYoudoxTokenCache(): void {
    cached = null;
}
