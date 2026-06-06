import crypto from 'crypto';

// Segreto di firma: da configurare in ambiente su Vercel (es. MAGIC_LINK_SECRET)
const MAGIC_LINK_SECRET = process.env.MAGIC_LINK_SECRET?.trim() || 'default-fallback-magic-link-secret-floremoria-2026';

export interface MagicLinkPayload {
    email: string;
    expiresAt: number;
}

/**
 * Genera un token crittografato e firmato digitalmente con scadenza a 15 minuti.
 */
export function generateMagicLinkToken(email: string): string {
    const payload: MagicLinkPayload = {
        email: email.trim().toLowerCase(),
        expiresAt: Date.now() + 15 * 60 * 1000, // 15 minuti di validità
    };
    
    const payloadStr = JSON.stringify(payload);
    
    // Firma HMAC SHA256 per garantire l'integrità (tampering-proof)
    const hmac = crypto.createHmac('sha256', MAGIC_LINK_SECRET);
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
        const hmac = crypto.createHmac('sha256', MAGIC_LINK_SECRET);
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
