/**
 * Accesso diretto alla bacheca foto post-consegna (senza schermata login).
 * Link corto DB-backed: /f/{code} — adatto a WhatsApp.
 */
import crypto from 'crypto';
import prisma from '../prisma';

interface ProofFotoPayload {
    orderId: string;
    expiresAt: number;
}

/** Caratteri URL-safe senza ambiguità visiva (0/O, 1/l/I). */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

/** 7 giorni: tempo sufficiente per aprire la testimonianza con calma (ALMA). */
export const PROOF_FOTO_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getProofFotoSecret(): string {
    const secret = process.env.MAGIC_LINK_SECRET?.trim();
    if (secret) return secret;
    if (process.env.NODE_ENV === 'production') {
        throw new Error('[proof-foto] MAGIC_LINK_SECRET mancante in produzione.');
    }
    return 'default-fallback-magic-link-secret-floremoria-2026';
}

function generateShortCode(length = 8): string {
    const bytes = crypto.randomBytes(length);
    let code = '';
    for (let i = 0; i < length; i += 1) {
        code += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
    }
    return code;
}

/** Base URL compatta per WhatsApp (senza www se possibile). */
export function getProofFotoPublicBase(): string {
    const base = (
        process.env.PROOF_FOTO_BASE_URL?.trim() ||
        process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
        process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
        'https://floremoria.com'
    ).replace(/\/$/, '');
    return base.replace('://www.', '://');
}

/**
 * Crea o riusa un codice corto persistente sull'ordine.
 * Evita token lunghi in firma HMAC dentro l'URL WhatsApp.
 */
export async function ensureProofFotoAccessCode(orderId: string): Promise<string> {
    const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { proofFotoCode: true, proofFotoExpiresAt: true },
    });
    if (!order) {
        throw new Error(`[proof-foto] Ordine ${orderId} non trovato.`);
    }

    const now = Date.now();
    if (
        order.proofFotoCode &&
        order.proofFotoExpiresAt &&
        order.proofFotoExpiresAt.getTime() > now
    ) {
        return order.proofFotoCode;
    }

    const expiresAt = new Date(now + PROOF_FOTO_TTL_MS);

    for (let attempt = 0; attempt < 8; attempt += 1) {
        const code = generateShortCode();
        try {
            await prisma.order.update({
                where: { id: orderId },
                data: { proofFotoCode: code, proofFotoExpiresAt: expiresAt },
            });
            return code;
        } catch {
            // Collisione unique su proofFotoCode — riprova.
        }
    }

    throw new Error('[proof-foto] Impossibile generare codice univoco.');
}

/** Risolve codice corto → orderId se valido e non scaduto. */
export async function resolveProofFotoOrderId(code: string): Promise<string | null> {
    const normalized = code.trim();
    if (!normalized || normalized.length > 10) return null;

    const order = await prisma.order.findFirst({
        where: { proofFotoCode: normalized },
        select: { id: true, proofFotoExpiresAt: true },
    });

    if (!order?.proofFotoExpiresAt || order.proofFotoExpiresAt.getTime() < Date.now()) {
        return null;
    }

    return order.id;
}

/** URL corto per WhatsApp — es. https://floremoria.com/f/Ab3k9Xm2 */
export async function buildProofFotoAccessUrl(orderId: string): Promise<string> {
    const code = await ensureProofFotoAccessCode(orderId);
    return `${getProofFotoPublicBase()}/f/${code}`;
}

// --- Legacy token /foto/{token} (retrocompatibilità link già inviati) ---

export function generateProofFotoToken(orderId: string): string {
    const payload: ProofFotoPayload = {
        orderId: orderId.trim(),
        expiresAt: Date.now() + PROOF_FOTO_TTL_MS,
    };
    const payloadStr = JSON.stringify(payload);
    const hmac = crypto.createHmac('sha256', getProofFotoSecret());
    hmac.update(payloadStr);
    const signature = hmac.digest('hex');
    return Buffer.from(JSON.stringify({ p: payloadStr, s: signature })).toString('base64url');
}

export function verifyProofFotoToken(token: string): string | null {
    if (!token?.trim()) return null;
    try {
        const parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as {
            p?: string;
            s?: string;
        };
        if (!parsed.p || !parsed.s) return null;

        const hmac = crypto.createHmac('sha256', getProofFotoSecret());
        hmac.update(parsed.p);
        if (parsed.s !== hmac.digest('hex')) return null;

        const payload = JSON.parse(parsed.p) as ProofFotoPayload;
        if (Date.now() > payload.expiresAt) return null;
        return payload.orderId || null;
    } catch {
        return null;
    }
}
