/**
 * Magic Link cliente post-consegna — scadenza rigida 24h (HMAC stateless).
 * Atterraggio: /auth/magic-photo?token=…
 */
import crypto from 'crypto';

export const MAGIC_PHOTO_TTL_MS = 24 * 60 * 60 * 1000;

interface MagicPhotoPayload {
    orderId: string;
    exp: number;
}

function getSecret(): string {
    const secret = process.env.MAGIC_LINK_SECRET?.trim();
    if (secret) return secret;
    if (process.env.NODE_ENV === 'production') {
        throw new Error('[magic-photo] MAGIC_LINK_SECRET mancante in produzione.');
    }
    return 'default-fallback-magic-link-secret-floremoria-2026';
}

function sign(payloadStr: string): string {
    return crypto.createHmac('sha256', getSecret()).update(payloadStr).digest('hex');
}

export function generateMagicPhotoDeliveryToken(orderId: string): string {
    const payload: MagicPhotoPayload = {
        orderId: orderId.trim(),
        exp: Date.now() + MAGIC_PHOTO_TTL_MS,
    };
    const payloadStr = JSON.stringify(payload);
    const envelope = { p: payloadStr, s: sign(payloadStr) };
    return Buffer.from(JSON.stringify(envelope)).toString('base64url');
}

export function verifyMagicPhotoDeliveryToken(token: string): { orderId: string } | { expired: true } | null {
    if (!token?.trim()) return null;
    try {
        const envelope = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as {
            p?: string;
            s?: string;
        };
        if (!envelope.p || !envelope.s) return null;
        if (envelope.s !== sign(envelope.p)) return null;

        const payload = JSON.parse(envelope.p) as MagicPhotoPayload;
        if (!payload.orderId) return null;
        if (Date.now() > payload.exp) return { expired: true };
        return { orderId: payload.orderId };
    } catch {
        return null;
    }
}

export function buildMagicPhotoDeliveryUrl(orderId: string): string {
    const base = (
        process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
        process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
        'https://www.floremoria.com'
    ).replace(/\/$/, '');
    const token = generateMagicPhotoDeliveryToken(orderId);
    return `${base}/auth/magic-photo?token=${encodeURIComponent(token)}`;
}
