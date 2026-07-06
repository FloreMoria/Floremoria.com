import { NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';
import { generateMagicLinkToken } from '@/lib/auth/magicLink';
import { sendMagicLinkEmail } from '@/lib/auth/magicLinkEmail';
import { findUserByEmail, findOrderByEmail, createUserFromOrder, isProfessionalRole, linkHistoricalOrders } from '@/lib/auth/identity';
import { sendAuthWhatsAppMessage } from '@/lib/auth/sendAuthWhatsApp';
import { getSiteBaseUrl } from '@/lib/site/config';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

        if (!email || !email.includes('@')) {
            return NextResponse.json(
                { success: false, message: 'Fornire un indirizzo email valido.' },
                { status: 400 }
            );
        }

        let user = await findUserByEmail(email);

        if (user) {
            if (isProfessionalRole(user.systemRole)) {
                return NextResponse.json(
                    {
                        success: false,
                        message: 'Questo metodo di accesso è riservato agli utenti privati. Per lo Staff e i Fioristi Partner è richiesto l\'accesso tramite codice personale.',
                    },
                    { status: 400 }
                );
            }
            await linkHistoricalOrders(user);
        } else {
            const order = await findOrderByEmail(email);
            user = order ? await createUserFromOrder(order) : null;
            if (!user) {
                user = await prisma.user.create({
                    data: {
                        email,
                        systemRole: UserRole.USER,
                        isActive: true,
                    },
                });
            }
        }

        const token = generateMagicLinkToken(email);
        const setupLink = `${getSiteBaseUrl()}/api/auth/magic-link/callback?token=${token}`;

        const mailResult = await sendMagicLinkEmail({
            email,
            setupLink,
        });

        if (!mailResult.ok) {
            console.error('[magic-link] Invio email fallito:', mailResult.error);
            return NextResponse.json(
                { success: false, message: 'Impossibile inviare l\'email di accesso. Riprova più tardi.' },
                { status: 500 }
            );
        }

        let sentWhatsApp = false;
        if (user.phone) {
            const waText = `FloreMoria — accedi al tuo profilo con questo link (valido 15 minuti): ${setupLink}`;
            const waResult = await sendAuthWhatsAppMessage(user.phone, waText);
            sentWhatsApp = waResult.ok;
            if (!waResult.ok) {
                console.warn('[magic-link-request] WhatsApp non inviato:', waResult.error);
            }
        }

        return NextResponse.json({
            success: true,
            message: sentWhatsApp
                ? 'Ti abbiamo inviato un collegamento di accesso via email e tramite WhatsApp.'
                : 'Ti abbiamo inviato un collegamento di accesso via email.',
        });
    } catch (error) {
        console.error('[magic-link-request] Errore:', error);
        return NextResponse.json(
            { success: false, message: 'Si è verificato un errore interno durante la richiesta di accesso.' },
            { status: 500 }
        );
    }
}
