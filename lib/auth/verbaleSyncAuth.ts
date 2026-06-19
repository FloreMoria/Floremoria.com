/**
 * Autenticazione condivisa per sync verbali server-to-server (Cursor, CI, webhook).
 * Accetta FLOREMORIA_WEBHOOK_KEY (x-api-key / Bearer) o ADMIN_API_KEY (x-admin-key).
 */
export function getVerbaleSyncAuthFromHeaders(headers: Headers): {
    apiKeyHeader?: string;
    adminKeyHeader?: string;
    bearer?: string;
} {
    const authHeader = headers.get('Authorization') || headers.get('authorization');
    return {
        apiKeyHeader: headers.get('x-api-key')?.trim() || undefined,
        adminKeyHeader: headers.get('x-admin-key')?.trim() || undefined,
        bearer: authHeader?.replace(/^Bearer\s/i, '').trim() || undefined,
    };
}

export function isVerbaleSyncAuthorized(
    headers: Headers,
    env: NodeJS.ProcessEnv = process.env
): boolean {
    const { apiKeyHeader, adminKeyHeader, bearer } = getVerbaleSyncAuthFromHeaders(headers);
    const webhookKey = env.FLOREMORIA_WEBHOOK_KEY?.trim();
    const adminKey = env.ADMIN_API_KEY?.trim();

    if (webhookKey && (apiKeyHeader === webhookKey || bearer === webhookKey)) return true;
    if (adminKey && adminKeyHeader === adminKey) return true;
    return false;
}

export function hasValidAdminApiKeyHeader(
    adminKeyHeader: string | null | undefined,
    env: NodeJS.ProcessEnv = process.env
): boolean {
    const expected = env.ADMIN_API_KEY?.trim();
    const key = adminKeyHeader?.trim();
    return Boolean(key && expected && key === expected);
}
