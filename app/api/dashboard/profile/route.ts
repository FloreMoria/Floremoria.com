import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
    buildSafeProfileUpdate,
    canManageOwnProfile,
    isBypassElevatedEmail,
    resolveSessionUser,
} from '@/lib/auth/sessionUser';

/** GET — profilo dell'utente di sessione (allineato a ensureElevatedUserRecord). */
export async function GET() {
    try {
        const { role, email, user } = await resolveSessionUser();

        if (!email || !user) {
            return NextResponse.json(
                { success: false, message: 'Sessione non valida o profilo non trovato.' },
                { status: 401 }
            );
        }

        if (!canManageOwnProfile(role, user)) {
            return NextResponse.json(
                { success: false, message: 'Non autorizzato a visualizzare questo profilo.' },
                { status: 403 }
            );
        }

        return NextResponse.json({
            success: true,
            profile: {
                id: user.id,
                name: user.name ?? '',
                email: user.email,
                phone: user.phone ?? '',
                company: user.company ?? '',
                vatNumber: user.vatNumber ?? '',
                systemRole: user.systemRole,
                emailReadOnly: isBypassElevatedEmail(user.email),
            },
        });
    } catch (error) {
        console.error('[profile GET]', error);
        return NextResponse.json(
            { success: false, message: 'Errore interno durante il caricamento del profilo.' },
            { status: 500 }
        );
    }
}

/**
 * PUT — aggiorna solo campi anagrafici whitelisted.
 * Isolamento password: passwordHash e credenziali env bypass non sono mai modificabili.
 */
export async function PUT(request: Request) {
    try {
        const { role, email, user } = await resolveSessionUser();

        if (!email || !user) {
            return NextResponse.json(
                { success: false, message: 'Sessione non valida o profilo non trovato.' },
                { status: 401 }
            );
        }

        if (!canManageOwnProfile(role, user)) {
            return NextResponse.json(
                { success: false, message: 'Non autorizzato a modificare questo profilo.' },
                { status: 403 }
            );
        }

        const body = await request.json();

        // Blocco esplicito: nessun campo sensibile può essere inviato dal client.
        const forbiddenKeys = [
            'password',
            'passwordHash',
            'systemRole',
            'roleId',
            'email',
            'isActive',
            'invitationToken',
            'inviteExpiresAt',
        ];
        for (const key of forbiddenKeys) {
            if (key in body && body[key] !== undefined) {
                return NextResponse.json(
                    {
                        success: false,
                        message: `Il campo "${key}" non può essere modificato da questa pagina.`,
                    },
                    { status: 400 }
                );
            }
        }

        const updateData = buildSafeProfileUpdate(body);
        if (Object.keys(updateData).length === 0) {
            return NextResponse.json(
                { success: false, message: 'Nessun dato valido da aggiornare.' },
                { status: 400 }
            );
        }

        const updated = await prisma.user.update({
            where: { id: user.id },
            data: updateData,
        });

        return NextResponse.json({
            success: true,
            message: 'Profilo aggiornato con successo.',
            profile: {
                id: updated.id,
                name: updated.name ?? '',
                email: updated.email,
                phone: updated.phone ?? '',
                company: updated.company ?? '',
                vatNumber: updated.vatNumber ?? '',
                systemRole: updated.systemRole,
                emailReadOnly: isBypassElevatedEmail(updated.email),
            },
        });
    } catch (error) {
        console.error('[profile PUT]', error);
        return NextResponse.json(
            { success: false, message: 'Errore interno durante il salvataggio del profilo.' },
            { status: 500 }
        );
    }
}
