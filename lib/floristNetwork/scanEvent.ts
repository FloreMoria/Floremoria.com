import { createHash, randomBytes } from 'crypto';
import prisma from '@/lib/prisma';

const UA_MAX = 512;

export function newPartnerScanSessionToken(): string {
    // 32 byte → 64 hex; allineato a FloristScanEvent.sessionToken @db.VarChar(64)
    return randomBytes(32).toString('hex');
}

export function hashClientIp(ip: string | null | undefined): string | null {
    const salt = process.env.IP_HASH_SALT?.trim();
    if (!salt) {
        console.error('[florist-network] IP_HASH_SALT mancante: ipHash non registrato');
        return null;
    }
    const normalized = (ip || '').split(',')[0]?.trim() || '';
    if (!normalized) return null;
    return createHash('sha256').update(`${normalized}${salt}`, 'utf8').digest('hex');
}

export function clientIpFromRequest(request: Request): string | null {
    const xf = request.headers.get('x-forwarded-for');
    if (xf) return xf.split(',')[0]?.trim() || null;
    const real = request.headers.get('x-real-ip');
    return real?.trim() || null;
}

export function truncateUserAgent(ua: string | null | undefined): string | null {
    if (!ua) return null;
    const t = ua.trim();
    if (!t) return null;
    return t.length > UA_MAX ? t.slice(0, UA_MAX) : t;
}

/**
 * Crea FloristScanEvent per Partner ACTIVE (vetrina QR).
 * Ritorna sessionToken da mettere nel cookie.
 */
export async function createFloristScanEvent(input: {
    floristId: string;
    ip: string | null;
    userAgent: string | null;
}): Promise<{ sessionToken: string; scanEventId: string }> {
    const sessionToken = newPartnerScanSessionToken();
    const row = await prisma.floristScanEvent.create({
        data: {
            floristId: input.floristId,
            sessionToken,
            ipHash: hashClientIp(input.ip),
            userAgent: truncateUserAgent(input.userAgent),
        },
        select: { id: true, sessionToken: true },
    });
    return { sessionToken: row.sessionToken, scanEventId: row.id };
}
