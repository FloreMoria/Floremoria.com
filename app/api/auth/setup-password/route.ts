import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const token = typeof body.token === 'string' ? body.token.trim() : '';
        const password = typeof body.password === 'string' ? body.password : '';

        if (!token) {
            return NextResponse.json(
                { success: false, message: 'Token mancante o non valido.' },
                { status: 400 }
            );
        }

        if (!password || password.length < 8) {
            return NextResponse.json(
                { success: false, message: 'La password deve contenere almeno 8 caratteri.' },
                { status: 400 }
            );
        }

        // Cerca l'utente associato a questo token di invito
        const user = await prisma.user.findUnique({
            where: { invitationToken: token },
        });

        if (!user) {
            return NextResponse.json(
                { success: false, message: 'Collegamento di attivazione non valido o già utilizzato.' },
                { status: 404 }
            );
        }

        // Verifica che il token non sia scaduto
        if (user.inviteExpiresAt && new Date() > user.inviteExpiresAt) {
            return NextResponse.json(
                { success: false, message: 'Questo collegamento di attivazione è scaduto (scadenza di 48 ore superata).' },
                { status: 400 }
            );
        }

        // Calcola l'hash sicuro della password (12 round di hashing)
        const passwordHash = await bcrypt.hash(password, 12);

        // Aggiorna l'anagrafica utente attivandolo e ripulendo il token
        await prisma.user.update({
            where: { id: user.id },
            data: {
                passwordHash,
                isActive: true,
                invitationToken: null,
                inviteExpiresAt: null,
            },
        });

        return NextResponse.json({
            success: true,
            message: 'Password impostata correttamente. Il tuo account è ora attivo.',
        });
    } catch (error) {
        console.error('[setup-password] Errore:', error);
        return NextResponse.json(
            { success: false, message: 'Si è verificato un errore interno durante la configurazione della password.' },
            { status: 500 }
        );
    }
}
