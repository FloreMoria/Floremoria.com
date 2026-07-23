/**
 * Magic Link cliente post-consegna — scadenza rigida 24h (HMAC stateless compatto).
 * Atterraggio: /auth/magic-photo?token=…
 */
import crypto from 'crypto';

export const MAGIC_PHOTO_TTL_MS = 24 * 60 * 60 * 1000;

function getSecret(): string {
    const secret = process.env.MAGIC_LINK_SECRET?.trim();
    if (secret) return secret;
    if (process.env.NODE_ENV === 'production') {
        throw new Error('[magic-photo] MAGIC_LINK_SECRET mancante in produzione.');
    }
    return 'default-fallback-magic-link-secret-floremoria-2026';
}

/**
 * Genera un token compatto nel formato: [orderId]-[expHex]-[shortSignature]
 * Riduce la lunghezza del token da ~192 caratteri a soli 51 caratteri.
 */
export function generateMagicPhotoDeliveryToken(orderId: string): string {
    const id = orderId.trim();
    const expSec = Math.floor((Date.now() + MAGIC_PHOTO_TTL_MS) / 1000);
    const expHex = expSec.toString(16);

    const rawSig = crypto
        .createHmac('sha256', getSecret())
        .update(`${id}:${expSec}`)
        .digest()
        .subarray(0, 12);
    const sigBase64 = rawSig.toString('base64url');

    return `${id}-${expHex}-${sigBase64}`;
}

/**
 * Verifica il token supportando sia il nuovo formato compatto sia il vecchio formato JSON (retrocompatibilità).
 */
export function verifyMagicPhotoDeliveryToken(token: string): { orderId: string } | { expired: true } | null {
    if (!token?.trim()) return null;
    try {
        // Se contiene trattini, usa il nuovo formato compatto
        if (token.includes('-')) {
            const parts = token.split('-');
            if (parts.length !== 3) return null;
            const [orderId, expHex, sigBase64] = parts;
            if (!orderId || !expHex || !sigBase64) return null;

            const expSec = parseInt(expHex, 16);
            if (isNaN(expSec)) return null;

            const expectedRawSig = crypto
                .createHmac('sha256', getSecret())
                .update(`${orderId}:${expSec}`)
                .digest()
                .subarray(0, 12);
            const expectedSigBase64 = expectedRawSig.toString('base64url');

            if (sigBase64 !== expectedSigBase64) return null;
            if (Date.now() > expSec * 1000) return { expired: true };
            return { orderId };
        }

        // Fallback per retrocompatibilità con il vecchio formato JSON base64url
        const envelope = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as {
            p?: string;
            s?: string;
        };
        if (!envelope.p || !envelope.s) return null;
        if (envelope.s !== crypto.createHmac('sha256', getSecret()).update(envelope.p).digest('hex')) return null;

        const payload = JSON.parse(envelope.p) as { orderId: string; exp: number };
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
