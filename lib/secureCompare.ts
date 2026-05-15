import { timingSafeEqual } from 'node:crypto';

/** Confronto costante nel tempo per segreti (password, token). */
export function secureCompareString(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
}
