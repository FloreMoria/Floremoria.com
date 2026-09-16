import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SCRYPT_SALT_LEN = 16;
const SCRYPT_KEY_LEN = 64;

export type PartnerApiKeyEnvironment = 'TEST' | 'LIVE';

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

function slugify(raw: string): string {
    const s = raw
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40);
    return s || randomBytes(4).toString('hex');
}

/** Public id: fmp_test_<slug> | fmp_live_<slug>[_suffix]. */
export function generatePartnerApiPublicId(
    environment: PartnerApiKeyEnvironment,
    slugSource?: string
): string {
    const env = environment === 'LIVE' ? 'live' : 'test';
    const slug = slugify(slugSource || randomBytes(6).toString('hex'));
    const suffix = randomBytes(3).toString('hex');
    return `fmp_${env}_${slug}_${suffix}`;
}

/** Segreto one-shot: fms_test_* | fms_live_*. Mai persistito in chiaro. */
export function generatePartnerApiSecretPlain(environment: PartnerApiKeyEnvironment): string {
    const env = environment === 'LIVE' ? 'live' : 'test';
    return `fms_${env}_${randomBytes(24).toString('base64url')}`;
}

export function inferEnvironmentFromPublicId(publicId: string): PartnerApiKeyEnvironment {
    if (publicId.startsWith('fmp_live_')) return 'LIVE';
    return 'TEST';
}
