import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { email, roleId, durationMins } = body;

        if (!email || !roleId || !durationMins) {
            return NextResponse.json({ error: 'Dati mancanti' }, { status: 400 });
        }

        // Calcolo della scadenza TTL
        const expiresAt = new Date(Date.now() + durationMins * 60 * 1000);

        // Funzione Database per associare scadenza all'utente
        const user = await prisma.user.upsert({
            where: { email },
            update: { roleId, roleExpiresAt: expiresAt },
            create: { email, name: email.split('@')[0] || 'Invitato', roleId, roleExpiresAt: expiresAt }
        });

        const role = await prisma.role.findUnique({ where: { id: roleId } });

        const response = NextResponse.json({ success: true, expiresAt });

        // HACK per test: per permettere un test immediato del TTL sullo stesso browser
        // (senza un vero flusso di magic-link inviato via email) iniettiamo direttamente
        // il cookie di sessione per simulare che l'utente assegnato abbia effettuato l'accesso.
        if (role) {
            response.cookies.set('fm_user_role', role.name, {
                path: '/',
            });
            response.cookies.set('fm_role_expires_at', expiresAt.toISOString(), {
                path: '/',
            });
        }

        return response;
    } catch (error) {
        console.error('Assign temp role error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
