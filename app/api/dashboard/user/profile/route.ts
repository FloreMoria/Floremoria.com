import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { UserRole } from '@prisma/client';
import { applySessionEmailCookie } from '@/lib/auth/sessionEmailCookie';
import { findUserByEmail } from '@/lib/auth/identity';
import { saveUserProfileFields, UserEmailUpdateError } from '@/lib/auth/userProfileSave';

const BACHECA_COOKIE_ROLES: UserRole[] = [UserRole.USER, UserRole.ADMIN, UserRole.SUPER_ADMIN];

async function resolveBachecaUser() {
    const cookieStore = await cookies();
    const cookieRole = cookieStore.get('fm_user_role')?.value;
    const userEmail = cookieStore.get('fm_user_email')?.value?.trim();

    if (!cookieRole || !userEmail || !BACHECA_COOKIE_ROLES.includes(cookieRole as UserRole)) {
        return null;
    }

    return findUserByEmail(userEmail);
}

/** GET — dati personali bacheca cliente. */
export async function GET() {
    const user = await resolveBachecaUser();
    if (!user) {
        return NextResponse.json({ success: false, message: 'Sessione non valida.' }, { status: 401 });
    }

    return NextResponse.json({
        success: true,
        profile: {
            name: user.name ?? '',
            email: user.email,
        },
    });
}

/** PUT — aggiorna nome/email bacheca cliente. */
export async function PUT(request: Request) {
    try {
        const user = await resolveBachecaUser();
        if (!user) {
            return NextResponse.json({ success: false, message: 'Sessione non valida.' }, { status: 401 });
        }

        const body = await request.json();
        const forbiddenKeys = ['password', 'passwordHash', 'systemRole', 'roleId', 'isActive'];
        for (const key of forbiddenKeys) {
            if (key in body && body[key] !== undefined) {
                return NextResponse.json(
                    { success: false, message: `Il campo "${key}" non può essere modificato.` },
                    { status: 400 }
                );
            }
        }

        const { user: updated, emailChanged } = await saveUserProfileFields({
            user,
            body,
            allowEmailChange: true,
        });

        const response = NextResponse.json({
            success: true,
            message: emailChanged
                ? 'Email e dati aggiornati. La sessione è stata allineata.'
                : 'Dati aggiornati con successo.',
            emailChanged,
            profile: {
                name: updated.name ?? '',
                email: updated.email,
            },
        });

        // Sempre: riallinea cookie alla email canonica in DB (anche se invariata / solo casing).
        applySessionEmailCookie(response, request, updated.email);

        return response;
    } catch (error) {
        if (error instanceof UserEmailUpdateError) {
            return NextResponse.json({ success: false, message: error.message }, { status: 400 });
        }
        console.error('[user/profile PUT]', error);
        return NextResponse.json(
            { success: false, message: 'Errore interno durante il salvataggio.' },
            { status: 500 }
        );
    }
}
