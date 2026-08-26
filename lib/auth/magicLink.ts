import crypto from 'crypto';
import { getSiteBaseUrl } from '@/lib/site/config';

/**
 * Risoluzione lazy del segreto di firma.
 * In produzione fallisce in modo bloccante se MAGIC_LINK_SECRET non è impostato,
 * eliminando il fallback hardcoded insicuro (token altrimenti forgiabili).
 * La risoluzione è lazy (a runtime, non al load del modulo) per non rompere `next build`.
 */
function getMagicLinkSecret(): string {
    const secret = process.env.MAGIC_LINK_SECRET?.trim();
    if (secret) return secret;
    if (process.env.NODE_ENV === 'production') {
        throw new Error(
            '[magic-link] MAGIC_LINK_SECRET non configurato in produzione: impossibile firmare/verificare i token in modo sicuro.'
        );
    }
    return 'default-fallback-magic-link-secret-floremoria-2026';
}

export interface MagicLinkPayload {
    email: string;
    expiresAt: number;
}

/** TTL login email standard (anti-ritardo caselle / scanner). */
export const MAGIC_LINK_LOGIN_TTL_MS = 24 * 60 * 60 * 1000;

/** TTL magic login post-consegna (WhatsApp VERA → area riservata). */
export const MAGIC_LOGIN_DELIVERY_TTL_MS = 24 * 60 * 60 * 1000;

export type MagicLinkVerifyResult =
    | { ok: true; email: string }
    | { ok: false; reason: 'invalid' | 'expired' };

/**
 * Pulisce token arrivati da email client (wrap, SafeLinks, doppia encoding).
 * `URLSearchParams.get` già decodifica una volta; qui gestiamo whitespace e residuali `%xx`.
 */
export function sanitizeMagicLinkToken(raw: string): string {
    let token = String(raw || '')
        .trim()
        .replace(/[\s\u00a0]+/g, '');
    if (!token) return '';
    // Alcuni client lasciano il token ancora percent-encoded.
    if (/%[0-9A-Fa-f]{2}/.test(token)) {
        try {
            token = decodeURIComponent(token);
        } catch {
            /* lascia il valore già ripulito */
        }
    }
    return token.trim();
}

/**
 * Genera un token crittografato e firmato digitalmente.
 * Default: 24 ore (login email). Post-consegna: `MAGIC_LOGIN_DELIVERY_TTL_MS`.
 */
export function generateMagicLinkToken(email: string, ttlMs = MAGIC_LINK_LOGIN_TTL_MS): string {
    const payload: MagicLinkPayload = {
        email: email.trim().toLowerCase(),
        expiresAt: Date.now() + ttlMs,
    };

    const payloadStr = JSON.stringify(payload);

    const hmac = crypto.createHmac('sha256', getMagicLinkSecret());
    hmac.update(payloadStr);
    const signature = hmac.digest('hex');

    const tokenObj = {
        payload: Buffer.from(payloadStr).toString('base64url'),
        signature,
    };

    return Buffer.from(JSON.stringify(tokenObj)).toString('base64url');
}

/**
 * Valida il token, ne verifica la firma e la scadenza.
 * Restituisce l'indirizzo email se valido, altrimenti null (compat legacy).
 */
export function verifyMagicLinkToken(token: string): string | null {
    const result = verifyMagicLinkTokenDetailed(token);
    return result.ok ? result.email : null;
}

/** Verifica con motivo (scaduto vs invalido) per redirect UX precisi. */
export function verifyMagicLinkTokenDetailed(token: string): MagicLinkVerifyResult {
    const cleaned = sanitizeMagicLinkToken(token);
    if (!cleaned) return { ok: false, reason: 'invalid' };

    try {
        const tokenObjStr = Buffer.from(cleaned, 'base64url').toString('utf-8');
        const tokenObj = JSON.parse(tokenObjStr);
        if (!tokenObj.payload || !tokenObj.signature) return { ok: false, reason: 'invalid' };

        const payloadStr = Buffer.from(tokenObj.payload, 'base64url').toString('utf-8');

        const hmac = crypto.createHmac('sha256', getMagicLinkSecret());
        hmac.update(payloadStr);
        const expectedSignature = hmac.digest('hex');

        if (tokenObj.signature !== expectedSignature) {
            console.warn('[magic-link] Firma del token non valida (tampering o MAGIC_LINK_SECRET diverso).');
            return { ok: false, reason: 'invalid' };
        }

        const payload: MagicLinkPayload = JSON.parse(payloadStr);

        if (Date.now() > payload.expiresAt) {
            console.warn(`[magic-link] Token scaduto per l'email: ${payload.email}`);
            return { ok: false, reason: 'expired' };
        }

        return { ok: true, email: payload.email };
    } catch (e) {
        console.error('[magic-link] Parsing del token fallito:', e);
        return { ok: false, reason: 'invalid' };
    }
}

export function normalizeMagicLinkEmail(email: string): string {
    return email.trim().toLowerCase();
}

/**
 * URL inviato via email: landing page (conferma click) → evita che scanner Outlook/Gmail
 * completino il login con un solo GET sul callback API.
 */
export function buildMagicLinkLoginUrl(email: string, ttlMs = MAGIC_LINK_LOGIN_TTL_MS): string {
    const base = getSiteBaseUrl();
    const token = generateMagicLinkToken(email, ttlMs);
    return `${base}/auth/magic-link?token=${encodeURIComponent(token)}`;
}

/** Magic login 24h post-consegna → `/api/auth/magic-login?token=…` */
export function buildMagicLoginUrl(email: string): string {
    const base = getSiteBaseUrl();
    const token = generateMagicLinkToken(email, MAGIC_LOGIN_DELIVERY_TTL_MS);
    return `${base}/api/auth/magic-login?token=${encodeURIComponent(token)}`;
}

/**
 * User-Agent tipici di scanner email / SafeLinks (non browser umani).
 * Non include WhatsApp/Telegram: lì l'utente clicca davvero e deve autenticarsi.
 */
export function isLikelyEmailLinkScanner(userAgent: string | null): boolean {
    if (!userAgent) return false;
    const ua = userAgent.toLowerCase();
    return (
        ua.includes('microsoft office') ||
        ua.includes('ms-office') ||
        ua.includes('safelinks') ||
        ua.includes('protection.outlook') ||
        ua.includes('proofpoint') ||
        ua.includes('mimecast') ||
        ua.includes('barracuda') ||
        ua.includes('googleimageproxy') ||
        ua.includes('yahoo! slurp') ||
        ua.includes('facebookexternalhit') ||
        ua.includes('twitterbot') ||
        ua.includes('linkedinbot')
    );
}
