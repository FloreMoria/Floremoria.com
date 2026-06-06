import crypto from 'crypto';
import { User, UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';

export class InviteError extends Error {}

/** Genera un token casuale crittograficamente sicuro di 32 byte (esadecimale) */
export function generateInviteToken(): string {
    return crypto.randomBytes(32).toString('hex');
}

/** Calcola la data di scadenza a partire dal momento corrente (48 ore) */
export function getInviteExpiryDate(): Date {
    return new Date(Date.now() + 48 * 60 * 60 * 1000);
}

export interface InviteUserParams {
    email: string;
    name?: string;
    phone?: string;
    role: UserRole;
}

export interface InviteUserResult {
    user: User;
    token: string;
    setupLink: string;
}

/**
 * Crea o aggiorna un utente impostandolo in stato inattivo con un token di invito valido per 48 ore.
 * Se l'utente esiste ed è già attivo, solleva un errore.
 */
export async function createOrInviteUser(params: InviteUserParams): Promise<InviteUserResult> {
    const email = params.email.trim().toLowerCase();
    const name = params.name?.trim() || null;
    const phone = params.phone?.trim() || null;
    
    if (!email) {
        throw new InviteError('Indirizzo email obbligatorio per l\'invito.');
    }

    const token = generateInviteToken();
    const expiresAt = getInviteExpiryDate();

    // Controlla se esiste già un utente con questa email
    const existingUser = await prisma.user.findUnique({
        where: { email },
    });

    let user: User;

    if (existingUser) {
        // Se l'utente è attivo (ha già impostato una password o è contrassegnato attivo), blocca l'operazione
        if (existingUser.isActive || existingUser.passwordHash) {
            throw new InviteError(`L'utente con email ${email} è già attivo sulla piattaforma.`);
        }

        // Altrimenti, aggiorna l'utente esistente con un nuovo token di invito per effettuare il re-invio
        user = await prisma.user.update({
            where: { id: existingUser.id },
            data: {
                name: name || existingUser.name,
                phone: phone || existingUser.phone,
                systemRole: params.role,
                invitationToken: token,
                inviteExpiresAt: expiresAt,
                isActive: false,
            },
        });
    } else {
        // Crea un nuovo utente inattivo con il token associato
        user = await prisma.user.create({
            data: {
                email,
                name,
                phone,
                systemRole: params.role,
                invitationToken: token,
                inviteExpiresAt: expiresAt,
                isActive: false,
            },
        });
    }

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.floremoria.com';
    const setupLink = `${baseUrl}/setup-password?token=${token}`;

    return {
        user,
        token,
        setupLink,
    };
}
