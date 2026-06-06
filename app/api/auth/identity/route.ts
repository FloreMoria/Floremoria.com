import { NextResponse } from 'next/server';
import { classifyLoginIdentity } from '@/lib/auth/identity';

/**
 * Login intelligente: dato un identificativo (email o telefono), indica al frontend
 * se proseguire con password (ruoli professionali) o passwordless (clienti USER),
 * e su quale canale (email → Magic Link, telefono → OTP).
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const identifier = typeof body.identifier === 'string' ? body.identifier.trim() : '';

        const result = await classifyLoginIdentity(identifier);

        if (!result.ok) {
            return NextResponse.json(
                { success: false, message: result.message || 'Identificativo non valido.' },
                { status: 400 }
            );
        }

        return NextResponse.json({
            success: true,
            mode: result.mode,
            channel: result.channel,
        });
    } catch (error) {
        console.error('[auth-identity] Errore:', error);
        return NextResponse.json(
            { success: false, message: 'Si è verificato un errore interno. Riprova più tardi.' },
            { status: 500 }
        );
    }
}
