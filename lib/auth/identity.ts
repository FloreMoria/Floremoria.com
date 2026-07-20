/**
 * Logica condivisa di identità per il login unificato FloreMoria.
 *
 * Obiettivi:
 *  - Riconoscere se l'identificativo è email o telefono.
 *  - Trovare l'utente in modo robusto (varianti telefoniche normalizzate).
 *  - Non escludere i clienti storici: se non esiste un User ma esiste un Ordine
 *    associato a quell'email/telefono, si crea al volo l'account USER agganciando
 *    lo storico ordini.
 *  - Classificare il metodo di accesso: passwordless (USER B2C) vs password (ruoli pro).
 */

import { Order, User, UserRole } from '@prisma/client';
import prisma from '../prisma';
import { isLegacyElevatedIdentifier } from '../superAdminLogin';
import { phoneVariants, phoneCore, toE164 } from './phone';

export type IdentifierType = 'email' | 'phone';
export type LoginMode = 'password' | 'passwordless';

export interface ParsedIdentifier {
    type: IdentifierType;
    email?: string;
    phone?: string;
}

/** Un ruolo è "professionale" (login con password) se è diverso da USER. */
export function isProfessionalRole(role: UserRole): boolean {
    return role !== UserRole.USER;
}

/** Distingue email da telefono. Restituisce null se l'input non è plausibile. */
export function parseIdentifier(raw: string): ParsedIdentifier | null {
    const value = (raw || '').trim();
    if (!value) return null;
    if (value.includes('@')) {
        return { type: 'email', email: value.toLowerCase() };
    }
    const digits = value.replace(/\D/g, '');
    if (digits.length < 6) return null;
    return { type: 'phone', phone: value };
}

export async function findUserByEmail(email: string): Promise<User | null> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return null;
    // Exact match first (path più comune: email già normalizzata in lowercase).
    const exact = await prisma.user.findUnique({ where: { email: normalized } });
    if (exact) return exact;
    // Legacy: account creati con casing misto — evita "Sessione non valida" sul profilo.
    return prisma.user.findFirst({
        where: { email: { equals: normalized, mode: 'insensitive' } },
    });
}

/** Cerca l'utente provando tutte le varianti del numero, con riserva "contains" sul nucleo. */
export async function findUserByPhone(rawPhone: string): Promise<User | null> {
    const variants = phoneVariants(rawPhone);
    if (variants.length === 0) return null;

    const exact = await prisma.user.findFirst({ where: { phone: { in: variants } } });
    if (exact) return exact;

    const core = phoneCore(rawPhone);
    if (core.length >= 9) {
        return prisma.user.findFirst({ where: { phone: { contains: core } } });
    }
    return null;
}

export async function findOrderByEmail(email: string): Promise<Order | null> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return null;
    return prisma.order.findFirst({
        where: { buyerEmail: { equals: normalized, mode: 'insensitive' }, deletedAt: null },
        orderBy: { createdAt: 'desc' },
    });
}

export async function findOrderByPhone(rawPhone: string): Promise<Order | null> {
    const variants = phoneVariants(rawPhone);
    if (variants.length === 0) return null;

    const exact = await prisma.order.findFirst({
        where: { customerPhone: { in: variants }, deletedAt: null },
        orderBy: { createdAt: 'desc' },
    });
    if (exact) return exact;

    const core = phoneCore(rawPhone);
    if (core.length >= 9) {
        return prisma.order.findFirst({
            where: { customerPhone: { contains: core }, deletedAt: null },
            orderBy: { createdAt: 'desc' },
        });
    }
    return null;
}

/**
 * Aggancia allo User tutti gli ordini storici (senza titolare) che corrispondono
 * alla sua email o al suo telefono. Idempotente: tocca solo gli ordini con userId nullo.
 */
export async function linkHistoricalOrders(user: User): Promise<number> {
    const or: Array<Record<string, unknown>> = [];
    if (user.email) {
        or.push({ buyerEmail: { equals: user.email, mode: 'insensitive' } });
    }
    if (user.phone) {
        const variants = phoneVariants(user.phone);
        if (variants.length) or.push({ customerPhone: { in: variants } });
    }
    if (or.length === 0) return 0;

    const result = await prisma.order.updateMany({
        where: { userId: null, OR: or },
        data: { userId: user.id },
    });
    return result.count;
}

/**
 * Crea un account USER a partire da un ordine storico e ne aggancia lo storico.
 * Se l'ordine non ha email, si sintetizza un indirizzo placeholder deterministico
 * (lo schema richiede User.email non nullo): l'accesso resta possibile via OTP telefonico.
 */
export async function createUserFromOrder(order: Order): Promise<User | null> {
    const phone = order.customerPhone?.trim() || null;
    const realEmail = order.buyerEmail?.trim().toLowerCase() || null;
    const name = order.buyerFullName?.trim() || null;

    if (!realEmail && !phone) return null;

    // Email definitiva: reale se presente, altrimenti placeholder agganciato al telefono.
    const phoneCoreId = phone ? phoneCore(phone) : '';
    const email = realEmail || `utente-${phoneCoreId || order.id}@phone.floremoria.local`;

    // Anti-collisione: se nel frattempo l'email esiste già, riusa quell'utente.
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        if (!existing.phone && phone) {
            await prisma.user.update({ where: { id: existing.id }, data: { phone } });
        }
        await linkHistoricalOrders({ ...existing, phone: existing.phone || phone });
        return existing;
    }

    const user = await prisma.user.create({
        data: {
            email,
            name,
            phone,
            systemRole: UserRole.USER,
            isActive: true,
        },
    });

    await linkHistoricalOrders(user);
    return user;
}

/**
 * Crea un account USER con solo telefono (registrazione B2C senza ordine precedente).
 */
export async function createUserWithPhone(rawPhone: string): Promise<User> {
    const phone = toE164(rawPhone) || rawPhone.trim();
    const core = phoneCore(rawPhone);
    const email = `utente-${core || Date.now()}@phone.floremoria.local`;

    const byPhone = await findUserByPhone(rawPhone);
    if (byPhone) return byPhone;

    const byEmail = await prisma.user.findUnique({ where: { email } });
    if (byEmail) return byEmail;

    return prisma.user.create({
        data: {
            email,
            phone,
            systemRole: UserRole.USER,
            isActive: true,
        },
    });
}

/**
 * Attiva o recupera un profilo USER per registrazione passwordless (email o telefono).
 * Restituisce null se l'identificativo appartiene a un ruolo professionale.
 */
export async function registerPasswordlessUser(
    parsed: ParsedIdentifier
): Promise<{ user: User; channel: IdentifierType } | null> {
    if (parsed.type === 'email' && parsed.email) {
        let user = await findUserByEmail(parsed.email);
        if (user?.systemRole && isProfessionalRole(user.systemRole)) return null;
        if (!user) {
            const order = await findOrderByEmail(parsed.email);
            if (order) {
                user = await createUserFromOrder(order);
            }
            if (!user) {
                user = await prisma.user.create({
                    data: {
                        email: parsed.email,
                        systemRole: UserRole.USER,
                        isActive: true,
                    },
                });
            }
        } else {
            await linkHistoricalOrders(user);
        }
        return { user, channel: 'email' };
    }

    if (parsed.type === 'phone' && parsed.phone) {
        let user = await findUserByPhone(parsed.phone);
        if (user?.systemRole && isProfessionalRole(user.systemRole)) return null;
        if (!user) {
            const order = await findOrderByPhone(parsed.phone);
            if (order) {
                user = await createUserFromOrder(order);
            }
            if (!user) {
                user = await createUserWithPhone(parsed.phone);
            }
        } else {
            await linkHistoricalOrders(user);
        }
        return { user, channel: 'phone' };
    }

    return null;
}

/**
 * Trova l'utente USER per email/telefono; se manca ma esiste uno storico ordini,
 * lo crea al volo. Restituisce null se non c'è alcun aggancio possibile.
 */
export async function findOrCreatePasswordlessUser(parsed: ParsedIdentifier): Promise<User | null> {
    if (parsed.type === 'email' && parsed.email) {
        const existing = await findUserByEmail(parsed.email);
        if (existing) return existing;
        const order = await findOrderByEmail(parsed.email);
        if (order) return createUserFromOrder(order);
        return null;
    }
    if (parsed.type === 'phone' && parsed.phone) {
        const existing = await findUserByPhone(parsed.phone);
        if (existing) return existing;
        const order = await findOrderByPhone(parsed.phone);
        if (order) return createUserFromOrder(order);
        return null;
    }
    return null;
}

export interface IdentityClassification {
    ok: boolean;
    type?: IdentifierType;
    mode?: LoginMode;
    channel?: IdentifierType;
    message?: string;
}

/**
 * Determina come deve proseguire il login per un dato identificativo.
 *  - ruolo professionale  → password
 *  - USER (o nuovo cliente email / storico ordini) → passwordless
 */
export async function classifyLoginIdentity(rawIdentifier: string): Promise<IdentityClassification> {
    const trimmed = rawIdentifier.trim();

    // Bypass prioritario: identificativi legacy ADMIN o SUPER_ADMIN (flusso password, ruoli distinti al login).
    if (isLegacyElevatedIdentifier(trimmed)) {
        return {
            ok: true,
            type: trimmed.includes('@') ? 'email' : 'email',
            mode: 'password',
            channel: 'email',
        };
    }

    const parsed = parseIdentifier(trimmed);
    if (!parsed) {
        return { ok: false, message: 'Inserisci un indirizzo email o un numero di telefono valido.' };
    }

    if (parsed.type === 'email' && parsed.email) {
        const user = await findUserByEmail(parsed.email);
        if (user && isProfessionalRole(user.systemRole)) {
            return { ok: true, type: 'email', mode: 'password', channel: 'email' };
        }
        // USER esistente, oppure email nuova (il Magic Link effettua l'onboarding silenzioso).
        return { ok: true, type: 'email', mode: 'passwordless', channel: 'email' };
    }

    // Telefono
    const user = await findUserByPhone(parsed.phone!);
    if (user && isProfessionalRole(user.systemRole)) {
        return {
            ok: false,
            type: 'phone',
            message: 'Per lo Staff e i Fioristi Partner l\'accesso avviene con email e password.',
        };
    }
    if (user) {
        return { ok: true, type: 'phone', mode: 'passwordless', channel: 'phone' };
    }
    // Nessun utente: c'è uno storico ordini su quel numero?
    const order = await findOrderByPhone(parsed.phone!);
    if (order) {
        return { ok: true, type: 'phone', mode: 'passwordless', channel: 'phone' };
    }
    return {
        ok: false,
        type: 'phone',
        message: 'Numero non trovato. Verifica il numero usato in fase d\'ordine oppure accedi con la tua email.',
    };
}
