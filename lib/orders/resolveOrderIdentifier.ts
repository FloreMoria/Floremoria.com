import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';

/**
 * Pulisce un riferimento ordine da route/query/WhatsApp (punto finale, spazi, encoding residuo).
 * Protezione a monte: WhatsApp spesso include il "." di fine frase nell'URL cliccabile.
 */
export function sanitizePublicOrderRef(rawRef: string): string {
    if (!rawRef) return '';
    let s = String(rawRef).trim();
    for (let i = 0; i < 3; i += 1) {
        try {
            if (/%[0-9A-Fa-f]{2}/.test(s)) {
                s = decodeURIComponent(s);
            } else {
                break;
            }
        } catch {
            break;
        }
    }
    return s
        .trim()
        .replace(/\.+$/, '')
        .replace(/[.,!?;:()[\]{}/\\~]+$/, '')
        .trim();
}

/**
 * Estrae tutti i possibili candidati identificativi da una stringa grezza di input
 * (gestisce URL encoding multiplo, hash '#', prefissi 'order-', punteggiatura WhatsApp, compound tokens, ecc.)
 */
export function extractOrderCandidates(rawRef: string): string[] {
    if (!rawRef) return [];
    let s = String(rawRef).trim();
    if (!s) return [];

    // 1. Decodifica percent-encoding fino a 3 iterazioni (es. %2523 → %23 → #)
    for (let i = 0; i < 3; i += 1) {
        try {
            if (/%[0-9A-Fa-f]{2}/.test(s)) {
                s = decodeURIComponent(s);
            } else {
                break;
            }
        } catch {
            break;
        }
    }
    s = s.trim();

    const candidates = new Set<string>();

    if (s) {
        candidates.add(s);
        candidates.add(s.toUpperCase());
        candidates.add(s.toLowerCase());
    }

    // 2. Rimuovi hash '#' e prefissi comuni 'order-', 'ordine:', 'ref-', 'ord_'
    let stripped = s
        .replace(/^#+/, '')
        .replace(/^(?:order|ordine|ord|ref|id|cod|codice)[-_:\s]+/i, '')
        .trim();

    // 3. Rimuovi eventuale punteggiatura finale catturata dai parser WhatsApp/SMS (. , ! ? ; : ) ] } / ~)
    stripped = stripped.replace(/[.,!?;:()[\]{}/\\~]+$/, '').trim();

    // 4. Rimuovi query string o hash se passati dentro il path (es. 'FT-LC-26-001?source=wa')
    const withoutQuery = stripped.split(/[?#]/)[0]?.trim() || '';
    if (withoutQuery) {
        candidates.add(withoutQuery);
        candidates.add(withoutQuery.toUpperCase());
        candidates.add(withoutQuery.toLowerCase());
    }

    if (stripped) {
        candidates.add(stripped);
        candidates.add(stripped.toUpperCase());
        candidates.add(stripped.toLowerCase());
    }

    // 5. Estrazione Regex codice ordine standard FloreMoria:
    // es. FT-LC-26-001, PT-UD-26-002, FF-CO-26-001, FA-RM-26-001, FP-TO-26-001, B2B-UD-26-001
    const orderNumberRegex = /\b([A-Za-z0-9]{2,4}-[A-Za-z0-9]{2,4}-\d{2}-\d{3,5})\b/g;
    let match: RegExpExecArray | null;
    while ((match = orderNumberRegex.exec(s)) !== null) {
        if (match[1]) {
            candidates.add(match[1]);
            candidates.add(match[1].toUpperCase());
            candidates.add(match[1].toLowerCase());
        }
    }

    // 6. Estrazione CUID Prisma (es. cmqgpyptm0001i6041bwgjpjg / c...) o UUID
    const cuidRegex = /\b(c[a-z0-9]{24})\b/gi;
    while ((match = cuidRegex.exec(s)) !== null) {
        if (match[1]) {
            candidates.add(match[1]);
            candidates.add(match[1].toLowerCase());
        }
    }

    const uuidRegex = /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/gi;
    while ((match = uuidRegex.exec(s)) !== null) {
        if (match[1]) {
            candidates.add(match[1]);
            candidates.add(match[1].toLowerCase());
        }
    }

    // 7. Split compound token su '_' o '-' o ':' (es. 'FT-LC-26-001_tok123' → 'FT-LC-26-001')
    const compoundParts = s.split(/[_:;]/);
    for (const part of compoundParts) {
        const pTrimmed = part.trim().replace(/[.,!?;:()[\]{}/\\~]+$/, '').trim();
        if (pTrimmed && pTrimmed.length >= 3) {
            candidates.add(pTrimmed);
            candidates.add(pTrimmed.toUpperCase());
            candidates.add(pTrimmed.toLowerCase());
        }
    }

    return Array.from(candidates).filter((c) => c.length > 0);
}

/**
 * Risolve un ordine da qualsiasi riferimento pubblico o interno:
 * - ID interno Prisma (CUID / UUID)
 * - Numero ordine parlante (es. FT-LC-26-001 / PT-UD-26-002) case-insensitive
 * - proofFotoCode / short code (link corti legacy)
 * - Riferimenti con encoding residuale, punteggiatura o token combinati
 */
export async function resolveOrderByPublicRef<S extends Prisma.OrderSelect>(
    ref: string,
    select: S
): Promise<Prisma.OrderGetPayload<{ select: S }> | null> {
    const cleanedRef = sanitizePublicOrderRef(ref);
    const candidates = extractOrderCandidates(cleanedRef || ref);
    if (!candidates.length) {
        console.error('[florist-delivery-debug] Nessun candidato estratto da ref:', {
            ref,
            cleanedRef,
        });
        return null;
    }

    // Ricerca diretta su id, orderNumber e proofFotoCode (esatta + case-insensitive)
    const orConditions: Prisma.OrderWhereInput[] = [];
    for (const cand of candidates) {
        orConditions.push({ id: cand });
        orConditions.push({ orderNumber: cand });
        orConditions.push({ proofFotoCode: cand });
        orConditions.push({ orderNumber: { equals: cand, mode: 'insensitive' } });
        orConditions.push({ proofFotoCode: { equals: cand, mode: 'insensitive' } });
    }

    const order = await prisma.order.findFirst({
        where: {
            deletedAt: null,
            OR: orConditions,
        },
        select,
    });

    if (order) {
        return order;
    }

    // Fallback elastico: ricerca case-insensitive con contains per catturare suffissi o prefissi non standard
    for (const cand of candidates) {
        if (cand.length >= 6) {
            const fallback = await prisma.order.findFirst({
                where: {
                    deletedAt: null,
                    OR: [
                        { orderNumber: { contains: cand, mode: 'insensitive' } },
                        { id: { contains: cand, mode: 'insensitive' } },
                    ],
                },
                select,
            });
            if (fallback) {
                console.warn('[florist-delivery-debug] Ordine trovato tramite fallback elastico:', {
                    ref,
                    matchedCandidate: cand,
                });
                return fallback;
            }
        }
    }

    console.error('[florist-delivery-debug] Ordine non trovato a database:', {
        param: ref,
        candidates,
        totalTested: candidates.length,
    });

    return null;
}

/** URL pubblico mini-app fiorista — preferisce il codice ordine parlante. */
export function buildFloristDeliveryPath(order: { id: string; orderNumber?: string | null }): string {
    const slug = order.orderNumber?.trim() || order.id;
    return `/fiorista/consegna/${encodeURIComponent(slug)}`;
}

export function buildFloristDeliveryUrl(
    order: { id: string; orderNumber?: string | null },
    baseUrl?: string
): string {
    const base = (
        baseUrl?.trim() ||
        process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
        process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
        'https://www.floremoria.com'
    ).replace(/\/$/, '');
    return `${base}${buildFloristDeliveryPath(order)}`;
}
