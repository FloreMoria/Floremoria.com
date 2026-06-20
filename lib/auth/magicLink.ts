import crypto from 'crypto';

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

/** TTL magic login post-consegna (WhatsApp Futuria → area riservata). */
export const MAGIC_LOGIN_DELIVERY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Genera un token crittografato e firmato digitalmente.
 * Default: 15 minuti (login standard). Post-consegna: passare `MAGIC_LOGIN_DELIVERY_TTL_MS`.
 */
export function generateMagicLinkToken(email: string, ttlMs = 15 * 60 * 1000): string {
    const payload: MagicLinkPayload = {
        email: email.trim().toLowerCase(),
        expiresAt: Date.now() + ttlMs,
    };
    
    const payloadStr = JSON.stringify(payload);
    
    // Firma HMAC SHA256 per garantire l'integrità (tampering-proof)
    const hmac = crypto.createHmac('sha256', getMagicLinkSecret());
    hmac.update(payloadStr);
    const signature = hmac.digest('hex');
    
    const tokenObj = {
        payload: Buffer.from(payloadStr).toString('base64url'),
        signature,
    };
    
    // Restituisce il token finale in formato Base64URL (sicuro per URL ed email)
    return Buffer.from(JSON.stringify(tokenObj)).toString('base64url');
}

/**
 * Valida il token, ne verifica la firma e la scadenza.
 * Restituisce l'indirizzo email dell'utente se il token è valido, altrimenti null.
 */
export function verifyMagicLinkToken(token: string): string | null {
    if (!token) return null;
    try {
        const tokenObjStr = Buffer.from(token, 'base64url').toString('utf-8');
        const tokenObj = JSON.parse(tokenObjStr);
        if (!tokenObj.payload || !tokenObj.signature) return null;
        
        const payloadStr = Buffer.from(tokenObj.payload, 'base64url').toString('utf-8');
        
        // Calcola e verifica la firma HMAC
        const hmac = crypto.createHmac('sha256', getMagicLinkSecret());
        hmac.update(payloadStr);
        const expectedSignature = hmac.digest('hex');
        
        if (tokenObj.signature !== expectedSignature) {
            console.warn('[magic-link] Firma del token non valida (tentativo di manomissione).');
            return null;
        }
        
        const payload: MagicLinkPayload = JSON.parse(payloadStr);
        
        // Verifica la scadenza temporale
        if (Date.now() > payload.expiresAt) {
            console.warn(`[magic-link] Token scaduto per l'email: ${payload.email}`);
            return null;
        }
        
        return payload.email;
    } catch (e) {
        console.error('[magic-link] Parsing del token fallito:', e);
        return null;
    }
}

export function normalizeMagicLinkEmail(email: string): string {
    return email.trim().toLowerCase();
}

/** Magic login 24h post-consegna → `/api/auth/magic-login?token=…` */
export function buildMagicLoginUrl(email: string): string {
    const base = (
        process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
        process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
        'https://www.floremoria.com'
    ).replace(/\/$/, '');
    const token = generateMagicLinkToken(email, MAGIC_LOGIN_DELIVERY_TTL_MS);
    return `${base}/api/auth/magic-login?token=${encodeURIComponent(token)}`;
}
