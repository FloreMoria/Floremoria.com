import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
    buildSafeProfileUpdate,
    canManageOwnProfile,
    isBypassElevatedEmail,
    resolveSessionUser,
} from '@/lib/auth/sessionUser';
import { applySessionEmailCookie } from '@/lib/auth/sessionEmailCookie';
import { saveUserProfileFields, UserEmailUpdateError } from '@/lib/auth/userProfileSave';

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
 * PUT — aggiorna campi anagrafici whitelisted (+ email se consentita).
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

        const forbiddenKeys = [
            'password',
            'passwordHash',
            'systemRole',
            'roleId',
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

        const emailReadOnly = isBypassElevatedEmail(user.email);
        if (emailReadOnly && typeof body.email === 'string' && body.email.trim().toLowerCase() !== user.email) {
            return NextResponse.json(
                { success: false, message: 'Email di sessione elevata: non modificabile.' },
                { status: 400 }
            );
        }

        const updateData = buildSafeProfileUpdate(body);
        const hasEmailField = typeof body.email === 'string';
        if (Object.keys(updateData).length === 0 && !hasEmailField) {
            return NextResponse.json(
                { success: false, message: 'Nessun dato valido da aggiornare.' },
                { status: 400 }
            );
        }

        const { user: updated, emailChanged } = await saveUserProfileFields({
            user,
            body,
            allowEmailChange: !emailReadOnly,
        });

        const response = NextResponse.json({
            success: true,
            message: emailChanged
                ? 'Profilo e email aggiornati con successo.'
                : 'Profilo aggiornato con successo.',
            emailChanged,
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

        if (emailChanged) {
            applySessionEmailCookie(response, request, updated.email);
        }

        return response;
    } catch (error) {
        if (error instanceof UserEmailUpdateError) {
            return NextResponse.json({ success: false, message: error.message }, { status: 400 });
        }
        console.error('[profile PUT]', error);
        return NextResponse.json(
            { success: false, message: 'Errore interno durante il salvataggio del profilo.' },
            { status: 500 }
        );
    }
}
