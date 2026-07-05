import { createHmac, timingSafeEqual } from 'node:crypto';

const SOCIAL_STAGING_PREFIX = 'futuria/campagne/publish-staging';
const DELIVERY_STAGING_PREFIX = 'whatsapp/delivery-staging';

/** Segreti candidati per firma/verifica HMAC staging media. */
export function getStagingSecretCandidates(): string[] {
    const raw = [
        process.env.SOCIAL_STAGING_SHARED_SECRET,
        process.env.MAGIC_LINK_SECRET,
        process.env.CRON_SECRET,
        process.env.POSTMAN_CRON_SECRET,
    ];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const value of raw) {
        const secret = value?.trim();
        if (!secret || seen.has(secret)) continue;
        seen.add(secret);
        out.push(secret);
    }
    return out;
}

function getStagingSecret(): string {
    const candidates = getStagingSecretCandidates();
    if (candidates.length === 0) {
        throw new Error(
            'Segreto staging media mancante (SOCIAL_STAGING_SHARED_SECRET, MAGIC_LINK_SECRET, CRON_SECRET o POSTMAN_CRON_SECRET).'
        );
    }
    return candidates[0]!;
}

export function getSiteBaseUrl(): string {
    const base =
        process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
        process.env.VERBALI_SYNC_PRODUCTION_URL?.trim() ||
        'https://www.floremoria.com';
    return base.replace(/\/$/, '');
}

function hmacMatches(pathname: string, expiresAt: number, sig: string, secret: string): boolean {
    const expected = createHmac('sha256', secret)
        .update(`${pathname}:${expiresAt}`)
        .digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expected);
    if (sigBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(sigBuf, expectedBuf);
}

export function createStagingToken(pathname: string, expiresAt: number): string {
    const payload = `${pathname}:${expiresAt}`;
    const sig = createHmac('sha256', getStagingSecret()).update(payload).digest('base64url');
    const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
    return `${payloadB64}.${sig}`;
}

const ALLOWED_STAGING_PREFIXES = [SOCIAL_STAGING_PREFIX, DELIVERY_STAGING_PREFIX];

export function verifyMediaStagingToken(
    token: string
): { pathname: string; expiresAt: number } | null {
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [payloadB64, sig] = parts;
    if (!payloadB64 || !sig) return null;

    let payload: string;
    try {
        payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
    } catch {
        return null;
    }

    const sep = payload.lastIndexOf(':');
    if (sep <= 0) return null;

    const pathname = payload.slice(0, sep);
    const expiresAt = Number.parseInt(payload.slice(sep + 1), 10);
    if (!pathname || !Number.isFinite(expiresAt)) return null;
    if (Date.now() > expiresAt) return null;
    if (!ALLOWED_STAGING_PREFIXES.some((prefix) => pathname.includes(prefix))) return null;

    if (process.env.SOCIAL_STAGING_VERIFY_BYPASS === 'true') {
        return { pathname, expiresAt };
    }

    for (const secret of getStagingSecretCandidates()) {
        if (hmacMatches(pathname, expiresAt, sig, secret)) {
            return { pathname, expiresAt };
        }
    }

    return null;
}

/** Ricostruisce URL Blob privato dal pathname staging. */
export function stagingPathnameToBlobUrl(pathname: string): string {
    const storeId = process.env.BLOB_STORE_ID?.replace(/^store_/i, '').trim();
    if (!storeId) {
        throw new Error('BLOB_STORE_ID mancante per servire immagine staging.');
    }
    return `https://${storeId.toLowerCase()}.private.blob.vercel-storage.com/${pathname}`;
}
