import { NextResponse } from 'next/server';
import { applySessionEmailCookie } from '@/lib/auth/sessionEmailCookie';
import { saveUserProfileFields, UserEmailUpdateError } from '@/lib/auth/userProfileSave';
import { resolveSessionUser } from '@/lib/auth/sessionUser';
import prisma from '@/lib/prisma';

async function resolveBachecaUser() {
    const { user } = await resolveSessionUser();
    return user;
}

/** GET — dati personali bacheca cliente inclusi i campi data. */
export async function GET() {
    const user = await resolveBachecaUser();
    if (!user) {
        return NextResponse.json({ success: false, message: 'Sessione non valida.' }, { status: 401 });
    }

    const latestOrder = await prisma.order.findFirst({
        where: {
            OR: [
                { userId: user.id },
                { buyerEmail: { equals: user.email, mode: 'insensitive' } },
            ],
        },
        orderBy: [{ deliveryDate: 'desc' }, { createdAt: 'desc' }],
    });

    return NextResponse.json({
        success: true,
        profile: {
            name: user.name ?? '',
            email: user.email,
            deceasedBirthDate: latestOrder?.deceasedBirthDate ? latestOrder.deceasedBirthDate.toISOString().slice(0, 10) : '',
            deceasedDeathDate: latestOrder?.deceasedDeathDate ? latestOrder.deceasedDeathDate.toISOString().slice(0, 10) : '',
            deliveryDate: latestOrder?.deliveryDate ? latestOrder.deliveryDate.toISOString().slice(0, 10) : '',
        },
    });
}

/** PUT — aggiorna nome/email e date bacheca cliente. */
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

        const { deceasedBirthDate, deceasedDeathDate, deliveryDate, ...profileBody } = body;

        // Esegui salvataggio anagrafica utente
        const { user: updated, emailChanged } = await saveUserProfileFields({
            user,
            body: profileBody,
            allowEmailChange: true,
        });

        // Aggiorna le date del defunto su tutti gli ordini dell'utente
        const orderUpdateData: Record<string, any> = {};
        if (deceasedBirthDate !== undefined) {
            orderUpdateData.deceasedBirthDate = deceasedBirthDate ? new Date(deceasedBirthDate) : null;
        }
        if (deceasedDeathDate !== undefined) {
            orderUpdateData.deceasedDeathDate = deceasedDeathDate ? new Date(deceasedDeathDate) : null;
        }

        if (Object.keys(orderUpdateData).length > 0) {
            await prisma.order.updateMany({
                where: {
                    OR: [
                        { userId: user.id },
                        { buyerEmail: { equals: user.email, mode: 'insensitive' } },
                    ],
                },
                data: orderUpdateData,
            });
        }

        // Aggiorna la data di consegna futura (solo per gli ordini non completati/annullati)
        if (deliveryDate !== undefined) {
            const parsedDeliveryDate = deliveryDate ? new Date(deliveryDate) : null;
            await prisma.order.updateMany({
                where: {
                    OR: [
                        { userId: user.id },
                        { buyerEmail: { equals: user.email, mode: 'insensitive' } },
                    ],
                    status: { in: ['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'DELIVERING'] },
                },
                data: {
                    deliveryDate: parsedDeliveryDate,
                },
            });
        }

        // Ricarica l'ordine più recente aggiornato per restituire le date caricate a chi le richiede
        const latestOrder = await prisma.order.findFirst({
            where: {
                OR: [
                    { userId: updated.id },
                    { buyerEmail: { equals: updated.email, mode: 'insensitive' } },
                ],
            },
            orderBy: [{ deliveryDate: 'desc' }, { createdAt: 'desc' }],
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
                deceasedBirthDate: latestOrder?.deceasedBirthDate ? latestOrder.deceasedBirthDate.toISOString().slice(0, 10) : '',
                deceasedDeathDate: latestOrder?.deceasedDeathDate ? latestOrder.deceasedDeathDate.toISOString().slice(0, 10) : '',
                deliveryDate: latestOrder?.deliveryDate ? latestOrder.deliveryDate.toISOString().slice(0, 10) : '',
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
