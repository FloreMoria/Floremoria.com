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
    query: string = '',
    limit = 30,
    filterType: 'ALL' | 'FLORIST' | 'UTENTE' = 'ALL'
): Promise<MessagingContactResult[]> {
    const q = normalizeSearchQuery(query);
    const take = Math.min(Math.max(limit, 1), 50);
    const results: MessagingContactResult[] = [];
    const seenPhones = new Set<string>();

    const pushResult = (entry: MessagingContactResult) => {
        if (!entry.phone || seenPhones.has(entry.sessionPhone)) return;
        seenPhones.add(entry.sessionPhone);
        results.push(entry);
    };

    // Helper per cercare i partner/fioristi
    const searchPartners = async () => {
        const partnerWhere: any = {
            deletedAt: null,
        };

        if (q.length > 0) {
            const cleanPhone = q.replace(/\s+/g, '');
            partnerWhere.OR = [
                { shopName: { contains: q, mode: 'insensitive' } },
                { ownerName: { contains: q, mode: 'insensitive' } },
                { whatsappNumber: { contains: cleanPhone } },
                { uniqueCode: { contains: q, mode: 'insensitive' } },
                { coverageArea: { contains: q, mode: 'insensitive' } },
                { address: { contains: q, mode: 'insensitive' } },
                { province: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
                { user: { name: { contains: q, mode: 'insensitive' } } },
                { user: { phone: { contains: cleanPhone } } },
            ];
        }

        const partners = await prisma.partner.findMany({
            where: partnerWhere,
            select: {
                id: true,
                shopName: true,
                ownerName: true,
                whatsappNumber: true,
                uniqueCode: true,
                province: true,
                coverageArea: true,
                address: true,
                user: {
                    select: { phone: true, name: true }
                }
            },
            orderBy: { updatedAt: 'desc' },
            take,
        });

        for (const partner of partners) {
            const phoneRaw = partner.whatsappNumber || partner.user?.phone || '';
            const sessionPhone = toWhatsAppSessionPhone(phoneRaw);
            if (!sessionPhone) continue;
            const ownerName = partner.ownerName?.trim() || partner.user?.name?.trim() || partner.shopName;
            const location = partner.province || partner.coverageArea || partner.address || '';

            pushResult({
                type: 'FLORIST',
                id: partner.id,
                name: partner.shopName || partner.ownerName || 'Fiorista Partner',
                phone: toE164(phoneRaw) || phoneRaw,
                sessionPhone,
                subtitle: [ownerName !== partner.shopName ? ownerName : null, location, partner.uniqueCode].filter(Boolean).join(' · '),
                initials: buildContactInitials(partner.shopName || ownerName),
                recipientFirstName: extractFirstName(ownerName),
            });
        }
    };

    // Helper per cercare gli utenti (clienti)
    const searchUsers = async () => {
        const userWhere: any = {
            deletedAt: null,
            phone: { not: null },
        };

        if (q.length > 0) {
            const cleanPhone = q.replace(/\s+/g, '');
            userWhere.OR = [
                { name: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
                { phone: { contains: cleanPhone } },
                { uniqueCode: { contains: q, mode: 'insensitive' } },
            ];
        }

        const users = await prisma.user.findMany({
            where: userWhere,
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
    };

    if (filterType === 'FLORIST') {
        await searchPartners();
    } else if (filterType === 'UTENTE') {
        await searchUsers();
    } else {
        // ALL: fioristi prima, poi clienti
        await searchPartners();
        await searchUsers();
    }

    if (q && looksLikePhoneQuery(q) && results.length < take) {
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
