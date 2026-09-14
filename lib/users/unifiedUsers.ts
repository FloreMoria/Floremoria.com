import { formatPersonName, compareBySurname } from '@/lib/utils/formatPersonName';
import { enrichOrderWithShareableLinks } from '@/lib/dashboard/enrichOrderShareableLinks';

export type UserRow = {
    id: string;
    name: string;
    email: string;
    phone: string;
    city: string;
    role: 'ADMIN' | 'CUSTOMER' | 'FLORIST';
    status: 'ACTIVE' | 'SUSPENDED';
    createdAt: string;
    profilePicUrl: string | null;
    userType: 'NEW' | 'REGULAR' | 'SUBSCRIBER';
    plannedDeliveryDates: string[];
    orders: any[];
    ordersCount: number;
    totalSpentCents: number;
    lastOrderDate: string;
    isRegistered?: boolean;
};

/**
 * Normalizza l'email per deduplicazione (trim e minuscolo).
 */
export function normalizeEmail(email?: string | null): string {
    if (!email) return '';
    return email.trim().toLowerCase();
}

/**
 * Normalizza il nome e cognome per deduplicazione (rimuove accenti, apostrofi, caratteri speciali e casing).
 */
export function normalizePersonNameKey(name?: string | null): string {
    if (!name) return '';
    const cleaned = name.replace(/\s+utente(\s+registrato|\s+sconosciuto)?$/i, '').trim();
    if (/^utente(\s+registrato|\s+sconosciuto)?$/i.test(cleaned) || /^utente$/i.test(cleaned) || /^admin$/i.test(cleaned)) {
        return '';
    }
    const formatted = formatPersonName(cleaned);
    const withoutDiacritics = formatted
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/['’`]/g, '')
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');

    return withoutDiacritics;
}

/**
 * Verifica se un account utente appartiene a un fiorista o partner.
 */
export function isFloristUser(user?: {
    systemRole?: string | null;
    role?: { name?: string | null } | null;
    partner?: any;
} | null): boolean {
    if (!user) return false;
    if (user.partner !== null && user.partner !== undefined) return true;
    if (user.systemRole === 'FLORIST' || user.systemRole === 'PARTNER_FLORIST') return true;
    const roleUpper = (user.role?.name || '').toUpperCase();
    if (roleUpper.includes('FLORIST') || roleUpper.includes('PARTNER')) return true;
    return false;
}

/**
 * Raggruppa e unifica i record utente registrati e gli ordini e-commerce:
 * 1. Esclude rigorosamente i fioristi/partner dalla tabella Utenti.
 * 2. Unifica i doppioni riferiti alla stessa persona fisica (per email o nome+cognome normalizzati).
 * 3. Somma volumi ordini, spesa complessiva e aggrega tutto lo storico ordini nel profilo principale.
 */
export function buildUnifiedUsersList(registeredUsers: any[], orders: any[]): UserRow[] {
    // 1. Escludi fioristi/partner dagli utenti registrati
    const customerUsers = registeredUsers.filter((u) => !isFloristUser(u));

    const clusters: UserRow[] = [];
    const byId = new Map<string, UserRow>();
    const byEmail = new Map<string, UserRow>();
    const byNormName = new Map<string, UserRow>();

    function findMatchingCluster(id?: string | null, email?: string | null, rawName?: string | null): UserRow | undefined {
        if (id && byId.has(id)) {
            return byId.get(id);
        }
        const normEmail = normalizeEmail(email);
        if (normEmail && byEmail.has(normEmail)) {
            return byEmail.get(normEmail);
        }
        const normName = normalizePersonNameKey(rawName);
        if (normName && (normName.includes(' ') || normName.length >= 5) && byNormName.has(normName)) {
            return byNormName.get(normName);
        }
        return undefined;
    }

    function indexCluster(cluster: UserRow, aliases: { id?: string | null; email?: string | null; name?: string | null }) {
        if (aliases.id) byId.set(aliases.id, cluster);
        const normEmail = normalizeEmail(aliases.email);
        if (normEmail) byEmail.set(normEmail, cluster);
        const normName = normalizePersonNameKey(aliases.name);
        if (normName && (normName.includes(' ') || normName.length >= 5)) {
            if (!byNormName.has(normName)) {
                byNormName.set(normName, cluster);
            }
        }
    }

    // 1. Inserisci e unifica gli utenti registrati
    customerUsers.forEach((u) => {
        let role: 'ADMIN' | 'CUSTOMER' | 'FLORIST' = 'CUSTOMER';
        const roleNameUpper = (u.role?.name || '').toUpperCase();
        if (roleNameUpper.includes('ADMIN') || u.systemRole === 'SUPER_ADMIN' || u.systemRole === 'ADMIN') {
            role = 'ADMIN';
        }

        const status: 'ACTIVE' | 'SUSPENDED' = u.deletedAt || u.isActive === false ? 'SUSPENDED' : 'ACTIVE';
        const cleanName = formatPersonName(u.name || '');

        const existing = findMatchingCluster(u.id, u.email, cleanName);

        if (existing) {
            // Se il cluster esistente era virtuale, eleva all'utente registrato con account DB
            if (!existing.isRegistered) {
                existing.id = u.id;
                existing.isRegistered = true;
            }
            if (role === 'ADMIN') existing.role = 'ADMIN';
            if (cleanName && (!existing.name || existing.name === 'Utente senza nome')) {
                existing.name = cleanName;
            }
            if (u.email && !existing.email) existing.email = u.email;
            if (u.phone && (existing.phone === 'Non specificato' || !existing.phone)) existing.phone = u.phone;
            if (u.city && (existing.city === 'Non specificata' || !existing.city)) existing.city = u.city;
            if (u.avatarUrl && !existing.profilePicUrl) existing.profilePicUrl = u.avatarUrl;
            if (u.userType && u.userType !== 'NEW') existing.userType = u.userType;
            if (u.plannedDeliveryDates && u.plannedDeliveryDates.length > 0) {
                existing.plannedDeliveryDates = Array.from(
                    new Set([...existing.plannedDeliveryDates, ...u.plannedDeliveryDates])
                );
            }
            indexCluster(existing, { id: u.id, email: u.email, name: cleanName });
        } else {
            const row: UserRow = {
                id: u.id,
                name: cleanName || (u.email ? u.email.split('@')[0] : 'Utente senza nome'),
                email: u.email || '',
                phone: u.phone || 'Non specificato',
                city: u.city || 'Non specificata',
                role,
                status,
                createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : new Date().toISOString(),
                profilePicUrl: u.avatarUrl || null,
                userType: u.userType || 'NEW',
                plannedDeliveryDates: u.plannedDeliveryDates || [],
                orders: [],
                ordersCount: 0,
                totalSpentCents: 0,
                lastOrderDate: u.createdAt ? new Date(u.createdAt).toISOString() : new Date().toISOString(),
                isRegistered: true,
            };
            clusters.push(row);
            indexCluster(row, { id: u.id, email: u.email, name: cleanName });
        }
    });

    // 2. Associa e raggruppa tutti gli ordini
    orders.forEach((order) => {
        // Escludi ordini collegati ad account utente fiorista
        if (isFloristUser(order.user)) {
            return;
        }

        const orderEmail = order.user?.email || order.buyerEmail || '';
        const orderRawName = order.user?.name || order.buyerFullName || '';
        const orderCleanName = formatPersonName(orderRawName);
        const orderUserId = order.userId || order.user?.id || null;

        let target = findMatchingCluster(orderUserId, orderEmail, orderCleanName);

        if (!target) {
            const row: UserRow = {
                id: orderUserId || `virtual_${order.id}`,
                name: orderCleanName || (orderEmail ? orderEmail.split('@')[0] : 'Utente senza nome'),
                email: orderEmail,
                phone: order.user?.phone || order.customerPhone || 'Non specificato',
                city: order.buyerCity || 'Non specificata',
                role: 'CUSTOMER',
                status: 'ACTIVE',
                createdAt: order.createdAt ? new Date(order.createdAt).toISOString() : new Date().toISOString(),
                profilePicUrl: order.user?.avatarUrl || null,
                userType: order.user?.userType || 'NEW',
                plannedDeliveryDates: order.user?.plannedDeliveryDates || [],
                orders: [],
                ordersCount: 0,
                totalSpentCents: 0,
                lastOrderDate: order.createdAt ? new Date(order.createdAt).toISOString() : new Date().toISOString(),
                isRegistered: false,
            };
            clusters.push(row);
            target = row;
            indexCluster(row, { id: row.id, email: orderEmail, name: orderCleanName });
        } else {
            // Re-indicizza per gli alias di questo ordine
            indexCluster(target, { id: orderUserId, email: orderEmail, name: orderCleanName });
        }

        // Aggiungi ordine e aggiorna aggregati
        target.orders.push(enrichOrderWithShareableLinks(order));
        target.ordersCount = target.orders.length;
        target.totalSpentCents += (order.totalPriceCents || 0);

        if (!target.profilePicUrl && order.user?.avatarUrl) {
            target.profilePicUrl = order.user.avatarUrl;
        }
        if ((target.phone === 'Non specificato' || !target.phone) && (order.user?.phone || order.customerPhone)) {
            target.phone = order.user?.phone || order.customerPhone;
        }
        if ((target.city === 'Non specificata' || !target.city) && order.buyerCity) {
            target.city = order.buyerCity;
        }

        const orderTime = new Date(order.createdAt).getTime();
        const lastTime = new Date(target.lastOrderDate).getTime();
        if (orderTime > lastTime) {
            target.lastOrderDate = new Date(order.createdAt).toISOString();
        }
    });

    // Ordinamento alfabetico per cognome A-Z
    clusters.sort((a, b) => compareBySurname(a.name, b.name));

    return clusters;
}
