/**
 * Arricchisce le sessioni chat dashboard con nome/cognome e, per fioristi, negozio + comune.
 * Perché: in sessione spesso resta solo il nome di battesimo o il profilo WhatsApp grezzo.
 */
import prisma from '@/lib/prisma';
import { normalizePhoneE164 } from '@/lib/whatsapp/metaCloudApiClient';
import { buildContactInitials } from '@/lib/whatsapp/sessionPhone';
import type { ChatSession } from '@/lib/chatStore';

export type EnrichedChatSession = ChatSession & {
    /** Nome visualizzato (nome + cognome). */
    displayName: string;
    /** Sottotitolo: negozio · comune per fioristi. */
    subtitle?: string;
    shopName?: string;
    city?: string;
};

function phoneDigits(raw: string): string {
    return (normalizePhoneE164(raw.replace(/^whatsapp:/i, '')) || raw).replace(/\D/g, '');
}

/** Estrae il comune da address / coverageArea partner. */
export function resolvePartnerCity(input: {
    coverageArea?: string | null;
    address?: string | null;
    province?: string | null;
}): string {
    const address = (input.address || '').trim();
    // "… 84017 Positano (SA)" oppure "…, 37049 Villa Bartolomea VR"
    const fromCap = address.match(/\b\d{5}\s+([A-Za-zÀ-ÖØ-öø-ÿ'’.\- ]+?)(?:\s*\(|\s*$|,)/);
    if (fromCap?.[1]?.trim()) return fromCap[1].trim();

    const area = (input.coverageArea || '').trim();
    if (area) {
        // "Tortora (CS)" / "Praiano" — evita etichette tipo "Cimitero di…"
        if (!/^cimitero\b/i.test(area) && area.length < 60) {
            return area.replace(/\s*\([^)]*\)\s*$/, '').trim();
        }
        const afterCimitero = area.match(/cimitero\s+(?:di\s+)?(.+)/i);
        if (afterCimitero?.[1]) return afterCimitero[1].trim();
    }

    return (input.province || '').trim();
}

function looksLikeFullName(name: string): boolean {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return parts.length >= 2 && !/^\+?\d+$/.test(name) && !/@/.test(name);
}

/**
 * Arricchisce un elenco di sessioni in batch (una query partner + ordini).
 */
export async function enrichChatSessionsForDashboard(
    sessions: ChatSession[]
): Promise<EnrichedChatSession[]> {
    if (!sessions.length) return [];

    const partners = await prisma.partner.findMany({
        where: { deletedAt: null, whatsappNumber: { not: null } },
        select: {
            ownerName: true,
            shopName: true,
            whatsappNumber: true,
            coverageArea: true,
            address: true,
            province: true,
        },
    });

    const partnerByDigits = new Map<
        string,
        {
            ownerName: string;
            shopName: string;
            city: string;
        }
    >();
    for (const p of partners) {
        const digits = phoneDigits(p.whatsappNumber || '');
        if (!digits || digits.length < 8) continue;
        partnerByDigits.set(digits, {
            ownerName: p.ownerName.trim(),
            shopName: p.shopName.trim(),
            city: resolvePartnerCity(p),
        });
    }

    // Ultimo ordine per telefono → buyerFullName (clienti)
    const orders = await prisma.order.findMany({
        where: {
            deletedAt: null,
            customerPhone: { not: null },
            buyerFullName: { not: null },
        },
        select: { customerPhone: true, buyerFullName: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 800,
    });
    const buyerByDigits = new Map<string, string>();
    for (const o of orders) {
        const digits = phoneDigits(o.customerPhone || '');
        if (!digits || buyerByDigits.has(digits)) continue;
        const full = (o.buyerFullName || '').trim();
        if (full) buyerByDigits.set(digits, full);
    }

    return sessions.map((session) => {
        const digits = phoneDigits(session.phone);
        const partner = partnerByDigits.get(digits);
        const buyerFull = buyerByDigits.get(digits);
        const current = (session.name || '').trim();

        if (partner || session.userType === 'FLORIST') {
            const personName =
                (partner?.ownerName && looksLikeFullName(partner.ownerName)
                    ? partner.ownerName
                    : null) ||
                (looksLikeFullName(current) ? current : null) ||
                partner?.ownerName ||
                current ||
                'Fiorista';
            const shopName = partner?.shopName || undefined;
            const city = partner?.city || undefined;
            const subtitleParts = [shopName, city].filter(Boolean);
            return {
                ...session,
                name: personName,
                displayName: personName,
                userType: 'FLORIST' as const,
                shopName,
                city,
                subtitle: subtitleParts.length ? subtitleParts.join(' · ') : undefined,
                initials: buildContactInitials(personName),
            };
        }

        const personName =
            (buyerFull && looksLikeFullName(buyerFull) ? buyerFull : null) ||
            (looksLikeFullName(current) ? current : null) ||
            buyerFull ||
            current ||
            session.phone.replace(/^whatsapp:/i, '');

        return {
            ...session,
            name: personName,
            displayName: personName,
            initials: buildContactInitials(personName),
        };
    });
}
