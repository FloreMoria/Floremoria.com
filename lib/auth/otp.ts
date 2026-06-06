import crypto from 'crypto';

const OTP_SECRET = process.env.MAGIC_LINK_SECRET?.trim() || 'default-fallback-magic-link-secret-floremoria-2026';

export interface OtpPayload {
    email: string;
    phone: string;
    otpHash: string;
    expiresAt: number;
}

/**
 * Calcola l'hash SHA256 del codice OTP concatenato al segreto.
 */
function hashOtpCode(code: string): string {
    const hash = crypto.createHash('sha256');
    hash.update(code + OTP_SECRET);
    return hash.digest('hex');
}

/**
 * Genera un token OTP crittografato e firmato digitalmente con scadenza a 5 minuti.
 */
export function generateOtpToken(email: string, phone: string, code: string): string {
    const payload: OtpPayload = {
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        otpHash: hashOtpCode(code),
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 minuti di validità
    };

    const payloadStr = JSON.stringify(payload);
    
    // Firma HMAC SHA256 per garantire l'integrità
    const hmac = crypto.createHmac('sha256', OTP_SECRET);
    hmac.update(payloadStr);
    const signature = hmac.digest('hex');

    const tokenObj = {
        payload: Buffer.from(payloadStr).toString('base64url'),
        signature,
    };

    return Buffer.from(JSON.stringify(tokenObj)).toString('base64url');
}

/**
 * Valida il token OTP inviato dal client confrontando il codice inserito.
 * Restituisce i dati dell'utente { email, phone } se valido, altrimenti null.
 */
export function verifyOtpToken(token: string, code: string): { email: string; phone: string } | null {
    if (!token || !code) return null;
    try {
        const tokenObjStr = Buffer.from(token, 'base64url').toString('utf-8');
        const tokenObj = JSON.parse(tokenObjStr);
        if (!tokenObj.payload || !tokenObj.signature) return null;

        const payloadStr = Buffer.from(tokenObj.payload, 'base64url').toString('utf-8');

        // Calcola e verifica la firma HMAC
        const hmac = crypto.createHmac('sha256', OTP_SECRET);
        hmac.update(payloadStr);
        const expectedSignature = hmac.digest('hex');

        if (tokenObj.signature !== expectedSignature) {
            console.warn('[OTP] Firma del token non valida (tentativo di manomissione).');
            return null;
        }

        const payload: OtpPayload = JSON.parse(payloadStr);

        // Verifica la scadenza temporale
        if (Date.now() > payload.expiresAt) {
            console.warn(`[OTP] Token scaduto per l'email: ${payload.email}`);
            return null;
        }

        // Verifica la corrispondenza del codice OTP inserito con l'hash firmato
        const submittedHash = hashOtpCode(code.trim());
        if (payload.otpHash !== submittedHash) {
            console.warn(`[OTP] Codice inserito errato per l'email: ${payload.email}`);
            return null;
        }

        return {
            email: payload.email,
            phone: payload.phone,
        };
    } catch (e) {
        console.error('[OTP] Validazione del token fallita:', e);
        return null;
    }
}
