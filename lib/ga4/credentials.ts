import fs from 'fs';
import path from 'path';
import { getGa4PropertyId } from '@/lib/ga4/config';

export type Ga4ServiceAccountCredentials = {
    client_email: string;
    private_key: string;
    [key: string]: unknown;
};

function parseJsonCredentials(raw: string): Ga4ServiceAccountCredentials | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    try {
        return JSON.parse(trimmed) as Ga4ServiceAccountCredentials;
    } catch {
        /* prova base64 */
    }

    try {
        const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
        return JSON.parse(decoded) as Ga4ServiceAccountCredentials;
    } catch {
        return null;
    }
}

/** Credenziali service account: env Vercel o file locale (dev). */
export function getGa4ServiceAccountCredentials(): Ga4ServiceAccountCredentials | null {
    const fromEnv = process.env.GA4_SERVICE_ACCOUNT_JSON;
    if (fromEnv) {
        const parsed = parseJsonCredentials(fromEnv);
        if (parsed?.client_email && parsed?.private_key) {
            return parsed;
        }
    }

    const credentialsPath =
        process.env.GA4_CREDENTIALS_PATH?.trim() ||
        path.join(process.cwd(), 'secrets/ga4-service-account.json');

    if (!fs.existsSync(credentialsPath)) {
        return null;
    }

    try {
        const parsed = JSON.parse(
            fs.readFileSync(credentialsPath, 'utf8'),
        ) as Ga4ServiceAccountCredentials;
        if (!parsed?.client_email || !parsed?.private_key) {
            return null;
        }
        if (parsed.private_key.includes('MOCK_PRIVATE_KEY')) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

export type Ga4OAuthCredentials = {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
};

/** OAuth con Gmail che ha già accesso GA4 (quando il service account non è aggiungibile in Analytics). */
export function getGa4OAuthCredentials(): Ga4OAuthCredentials | null {
    const clientId = process.env.GA4_OAUTH_CLIENT_ID?.trim();
    const clientSecret = process.env.GA4_OAUTH_CLIENT_SECRET?.trim();
    const refreshToken = process.env.GA4_OAUTH_REFRESH_TOKEN?.trim();
    if (clientId && clientSecret && refreshToken) {
        return { clientId, clientSecret, refreshToken };
    }
    return null;
}

export function isGa4ApiConfigured(): boolean {
    return Boolean(
        getGa4PropertyId() &&
            (getGa4ServiceAccountCredentials() || getGa4OAuthCredentials()),
    );
}
