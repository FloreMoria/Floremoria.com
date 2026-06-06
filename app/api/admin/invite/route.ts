import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createOrInviteUser, InviteError } from '@/lib/auth/invite';
import { sendInviteEmail } from '@/lib/auth/inviteEmail';
import { UserRole } from '@prisma/client';

export async function POST(request: Request) {
    // 1. Verifichiamo se la sessione appartiene a SUPER_ADMIN o ADMIN
    const cookieStore = await cookies();
    const userRole = cookieStore.get('fm_user_role')?.value;

    if (!userRole || !['SUPER_ADMIN', 'ADMIN'].includes(userRole)) {
        return NextResponse.json(
            { error: 'Accesso riservato ad Amministratorore o Super Admin.' },
            { status: 403 }
        );
    }

    try {
        const body = await request.json();
        const { email, name, phone, role } = body;

        if (!email || !role) {
            return NextResponse.json(
                { error: 'I campi Email e Ruolo sono obbligatori.' },
                { status: 400 }
            );
        }

        // 2. Verifichiamo che il ruolo appartenga all'enum UserRole e non sia SUPER_ADMIN o USER
        const validRoles = Object.values(UserRole).filter(
            (r) => r !== UserRole.SUPER_ADMIN && r !== UserRole.USER
        );

        if (!validRoles.includes(role as any)) {
            return NextResponse.json(
                {
                    error: `Ruolo selezionato non valido o non autorizzato per l'invito. Ruoli consentiti: ${validRoles.join(
                        ', '
                    )}`,
                },
                { status: 400 }
            );
        }

        // 3. Generazione dell'invito (creazione o aggiornamento record inattivo con token di 48 ore)
        const inviteResult = await createOrInviteUser({
            email,
            name: name || undefined,
            phone: phone || undefined,
            role: role as UserRole,
        });

        // 4. Invio dell'email transazionale con template antracite/oro
        const emailResult = await sendInviteEmail({
            email: inviteResult.user.email,
            name: inviteResult.user.name,
            role: inviteResult.user.systemRole,
            setupLink: inviteResult.setupLink,
        });

        if (!emailResult.ok) {
            return NextResponse.json({
                success: true,
                warning: 'Utente creato con successo, ma l\'invio dell\'email è fallito.',
                setupLink: inviteResult.setupLink,
            });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        if (error instanceof InviteError) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        console.error('[API Invite B2B Error]:', error);
        return NextResponse.json(
            { error: 'Errore interno del server durante la creazione dell\'invito.' },
            { status: 500 }
        );
    }
}
