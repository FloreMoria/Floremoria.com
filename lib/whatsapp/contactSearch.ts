import prisma from '@/lib/prisma';
import { toE164 } from '@/lib/auth/phone';
import { extractFirstName } from '@/lib/whatsapp/proactiveTemplateParams';
import { buildContactInitials, toWhatsAppSessionPhone } from '@/lib/whatsapp/sessionPhone';

export type MessagingContactType = 'UTENTE' | 'FLORIST';

export interface MessagingContactResult {
    type: MessagingContactType;
    id: string;
    name: string;
    phone: string;
    sessionPhone: string;
    subtitle: string;
    initials: string;
    /** Nome di battesimo per {{1}} — pre-compilato alla selezione. */
    recipientFirstName: string;
}

function normalizeSearchQuery(query: string): string {
    return query.trim();
}

function looksLikePhoneQuery(query: string): boolean {
    const digits = query.replace(/\D/g, '');
    return digits.length >= 6;
}

export async function searchMessagingContacts(
    query: string,
    limit = 20
): Promise<MessagingContactResult[]> {
    const q = normalizeSearchQuery(query);
    if (q.length < 2) return [];

    const take = Math.min(Math.max(limit, 1), 30);
    const results: MessagingContactResult[] = [];
    const seenPhones = new Set<string>();

    const pushResult = (entry: MessagingContactResult) => {
        if (seenPhones.has(entry.sessionPhone)) return;
        seenPhones.add(entry.sessionPhone);
        results.push(entry);
    };

    const users = await prisma.user.findMany({
        where: {
            deletedAt: null,
            phone: { not: null },
            OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q.replace(/\s+/g, '') } },
                { uniqueCode: { contains: q, mode: 'insensitive' } },
            ],
        },
        select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            uniqueCode: true,
        },
        orderBy: { updatedAt: 'desc' },
        take,
    });

    for (const user of users) {
        const sessionPhone = toWhatsAppSessionPhone(user.phone);
        if (!sessionPhone) continue;
        const displayName = user.name?.trim() || user.email;
        pushResult({
            type: 'UTENTE',
            id: user.id,
            name: displayName,
            phone: toE164(user.phone || '') || user.phone || '',
            sessionPhone,
            subtitle: [user.uniqueCode, user.email].filter(Boolean).join(' · '),
            initials: buildContactInitials(displayName),
            recipientFirstName: extractFirstName(displayName),
        });
    }

    const partners = await prisma.partner.findMany({
        where: {
            deletedAt: null,
            isActive: true,
            whatsappNumber: { not: null },
            OR: [
                { shopName: { contains: q, mode: 'insensitive' } },
                { ownerName: { contains: q, mode: 'insensitive' } },
                { whatsappNumber: { contains: q.replace(/\s+/g, '') } },
                { uniqueCode: { contains: q, mode: 'insensitive' } },
            ],
        },
        select: {
            id: true,
            shopName: true,
            ownerName: true,
            whatsappNumber: true,
            uniqueCode: true,
            province: true,
        },
        orderBy: { updatedAt: 'desc' },
        take,
    });

    for (const partner of partners) {
        const sessionPhone = toWhatsAppSessionPhone(partner.whatsappNumber);
        if (!sessionPhone) continue;
        const ownerName = partner.ownerName?.trim() || partner.shopName;
        pushResult({
            type: 'FLORIST',
            id: partner.id,
            name: partner.shopName,
            phone: toE164(partner.whatsappNumber || '') || partner.whatsappNumber || '',
            sessionPhone,
            subtitle: [partner.ownerName, partner.uniqueCode, partner.province].filter(Boolean).join(' · '),
            initials: buildContactInitials(partner.shopName),
            recipientFirstName: extractFirstName(ownerName),
        });
    }

    if (looksLikePhoneQuery(q) && results.length < take) {
        const sessionPhone = toWhatsAppSessionPhone(q);
        if (sessionPhone && !seenPhones.has(sessionPhone)) {
            const e164 = toE164(q);
            pushResult({
                type: 'UTENTE',
                id: `manual:${sessionPhone}`,
                name: e164 || q,
                phone: e164 || q,
                sessionPhone,
                subtitle: 'Numero non registrato in piattaforma',
                initials: buildContactInitials(e164 || q),
                recipientFirstName: '',
            });
        }
    }

    return results.slice(0, take);
}
