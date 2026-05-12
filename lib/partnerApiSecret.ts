import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SCRYPT_SALT_LEN = 16;
const SCRYPT_KEY_LEN = 64;

/** Formato persistito: `<saltHex>:<keyHex>` (scrypt). */
export function hashPartnerApiSecret(plain: string): string {
    const salt = randomBytes(SCRYPT_SALT_LEN);
    const key = scryptSync(plain, salt, SCRYPT_KEY_LEN);
    return `${salt.toString('hex')}:${key.toString('hex')}`;
}

export function verifyPartnerApiSecret(plain: string, stored: string): boolean {
    const parts = stored.split(':');
    if (parts.length !== 2) return false;
    const [saltHex, keyHex] = parts;
    if (!saltHex || !keyHex || saltHex.length % 2 !== 0 || keyHex.length % 2 !== 0) return false;
    let salt: Buffer;
    let expectedKey: Buffer;
    try {
        salt = Buffer.from(saltHex, 'hex');
        expectedKey = Buffer.from(keyHex, 'hex');
    } catch {
        return false;
    }
    if (salt.length === 0 || expectedKey.length === 0) return false;
    const candidate = scryptSync(plain, salt, expectedKey.length);
    if (candidate.length !== expectedKey.length) return false;
    return timingSafeEqual(candidate, expectedKey);
}

export function generatePartnerApiPublicId(): string {
    return `fmp_${randomBytes(16).toString('hex')}`;
}

/** Segreto mostrato una sola volta (es. 43 caratteri url-safe). */
export function generatePartnerApiSecretPlain(): string {
    return `fms_${randomBytes(24).toString('base64url')}`;
}
