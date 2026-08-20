/**
 * Utility di sicurezza Anti-Bot & Rate Limiting per endpoint di autenticazione e form pubblici.
 */

interface RateLimitRecord {
    count: number;
    resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();

/**
 * Controlla se il payload della richiesta contiene un campo Honeypot compilato da un bot.
 * Campi honeypot tipici: 'website', 'hp_field', 'address_line2', 'confirm_email_address'.
 */
export function checkHoneypot(body: Record<string, any>): boolean {
    if (!body || typeof body !== 'object') return false;
    const honeypotKeys = ['website', 'hp_field', 'address_line2', 'confirm_email_address'];
    for (const key of honeypotKeys) {
        if (body[key] !== undefined && body[key] !== null && String(body[key]).trim() !== '') {
            return true; // Bot individuato!
        }
    }
    return false;
}

/**
 * Rate Limiter in memoria basato su IP o Identificatore.
 * Default: Max 5 tentativi per finestra di 10 minuti (600.000 ms).
 */
export function checkRateLimit(
    identifier: string,
    maxRequests = 5,
    windowMs = 10 * 60 * 1000
): { isRateLimited: boolean; remaining: number; resetInSeconds: number } {
    const key = `ratelimit:${identifier}`;
    const now = Date.now();
    const record = rateLimitMap.get(key);

    if (!record || now > record.resetAt) {
        rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
        return { isRateLimited: false, remaining: maxRequests - 1, resetInSeconds: Math.ceil(windowMs / 1000) };
    }

    if (record.count >= maxRequests) {
        const resetInSeconds = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
        return { isRateLimited: true, remaining: 0, resetInSeconds };
    }

    record.count += 1;
    return { isRateLimited: false, remaining: maxRequests - record.count, resetInSeconds: Math.ceil((record.resetAt - now) / 1000) };
}

/**
 * Ottiene l'IP del client dall'intestazione Next.js / Vercel.
 */
export function getClientIp(request: Request): string {
    const xForwardedFor = request.headers.get('x-forwarded-for');
    if (xForwardedFor) {
        return xForwardedFor.split(',')[0].trim();
    }
    const xRealIp = request.headers.get('x-real-ip');
    if (xRealIp) return xRealIp.trim();
    return '127.0.0.1';
}
