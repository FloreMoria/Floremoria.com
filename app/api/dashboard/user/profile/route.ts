import { NextResponse } from 'next/server';
import { applySessionEmailCookie } from '@/lib/auth/sessionEmailCookie';
import { saveUserProfileFields, UserEmailUpdateError } from '@/lib/auth/userProfileSave';
import { resolveSessionUser } from '@/lib/auth/sessionUser';
import { createUserFromOrder, findOrderByEmail, findUserByEmail } from '@/lib/auth/identity';
import prisma from '@/lib/prisma';
import { sanitizePlannedDeliveryDates } from '@/lib/users/profileUserType';
import type { User } from '@prisma/client';

/**
 * Risolve l'Utente bacheca con self-heal:
 * se il cookie email è valido ma manca il record User (caso Isabella / ordini storici),
 * lo ricrea agganciando lo storico — evita "Sessione non valida" al salvataggio date.
 */
/**
 * Risolve l'Utente bacheca con self-heal:
 * 1. Dalla sessione attiva (cookie fm_user_email).
 * 2. Tramite token/userId/userCode/email nei parametri della richiesta, headers o Referer.
 * 3. Se il record Manca, lo rigenera dagli ordini storici.
 */
async function resolveBachecaUser(request?: Request, bodyParams?: Record<string, unknown>): Promise<User | null> {
    const { user, email } = await resolveSessionUser();
    if (user) return user;

    let targetIdentifier = email;

    if (!targetIdentifier && request) {
        try {
            const url = new URL(request.url);
            targetIdentifier =
                url.searchParams.get('email') ||
                url.searchParams.get('userId') ||
                url.searchParams.get('userCode') ||
                url.searchParams.get('code') ||
                url.searchParams.get('token') ||
                '';

            if (!targetIdentifier && bodyParams) {
                targetIdentifier = String(
                    bodyParams.userId || bodyParams.userCode || bodyParams.email || bodyParams.token || ''
                ).trim();
            }

            if (!targetIdentifier) {
                const referer = request.headers.get('referer') || '';
                if (referer.includes('/giardino/')) {
                    const slug = referer.split('/giardino/')[1]?.split('?')[0]?.split('/')[0];
                    if (slug && slug !== 'UT-DEMO') {
                        targetIdentifier = slug;
                    }
                }
            }
        } catch {
            // Error parsing URL or referer ignored
        }
    }

    if (!targetIdentifier) return null;

    const lower = targetIdentifier.toLowerCase();
    const existing = await prisma.user.findFirst({
        where: {
            OR: [
                { email: lower },
                { uniqueCode: targetIdentifier },
                { id: targetIdentifier },
            ],
        },
    });
    if (existing) return existing;

    const order = await findOrderByEmail(lower);
    if (!order) return null;

    try {
        return await createUserFromOrder(order);
    } catch (error) {
        console.error('[user/profile] self-heal createUserFromOrder fallito:', error);
        return null;
    }
}

function toDateInput(value: Date | null | undefined): string {
    return value ? value.toISOString().slice(0, 10) : '';
}

/** GET — dati personali bacheca cliente inclusi i campi data. */
export async function GET(request: Request) {
    const user = await resolveBachecaUser(request);
    if (!user) {
        return NextResponse.json(
            { success: false, message: 'Sessione non valida. Effettui di nuovo l\'accesso al Giardino della Memoria.' },
            { status: 401 }
        );
    }

    const latestOrder = await prisma.order.findFirst({
        where: {
            OR: [
                { userId: user.id },
                { buyerEmail: { equals: user.email, mode: 'insensitive' } },
            ],
        },
        orderBy: [{ deliveryDate: 'desc' }, { createdAt: 'desc' }],
        include: {
            deceasedProfile: { select: { plannedDeliveryDates: true } },
        },
    });

    const plannedFromUser = sanitizePlannedDeliveryDates(user.plannedDeliveryDates);
    const plannedFromDeceased = sanitizePlannedDeliveryDates(
        latestOrder?.deceasedProfile?.plannedDeliveryDates
    );
    const plannedDeliveryDates =
        plannedFromUser.length > 0 ? plannedFromUser : plannedFromDeceased;

    const response = NextResponse.json({
        success: true,
        profile: {
            name: user.name ?? '',
            email: user.email,
            phone: user.phone ?? '',
            city: user.city ?? '',
            userType: user.userType,
            deliveryDate: toDateInput(latestOrder?.deliveryDate),
            plannedDeliveryDates,
        },
    });

    applySessionEmailCookie(response, request, user.email);
    return response;
}

/** PUT — aggiorna nome/email e date bacheca cliente (incl. fino a 10 date future senza impegno). */
export async function PUT(request: Request) {
    try {
        const body = await request.json();
        const user = await resolveBachecaUser(request, body);
        if (!user) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        'Sessione non valida. Effettui di nuovo l\'accesso al Giardino della Memoria (link email/WhatsApp o login).',
                },
                { status: 401 }
            );
        }

        const forbiddenKeys = ['password', 'passwordHash', 'systemRole', 'roleId', 'isActive', 'userType'];
        for (const key of forbiddenKeys) {
            if (key in body && body[key] !== undefined) {
                return NextResponse.json(
                    { success: false, message: `Il campo "${key}" non può essere modificato.` },
                    { status: 400 }
                );
            }
        }

        const {
            deceasedBirthDate,
            deceasedDeathDate,
            deliveryDate,
            plannedDeliveryDates: plannedRaw,
            phone,
            city,
            ...profileBody
        } = body;

        const profileDataToSave: Record<string, unknown> = { ...profileBody };
        if (phone !== undefined) {
            profileDataToSave.phone = phone ? String(phone).trim() : null;
        }
        if (city !== undefined) {
            profileDataToSave.city = city ? String(city).trim() : null;
        }

        const { user: updated, emailChanged } = await saveUserProfileFields({
            user,
            body: profileDataToSave,
            allowEmailChange: true,
        });

        // Retrocompatibilità: singola deliveryDate sugli ordini aperti
        if (deliveryDate !== undefined && plannedRaw === undefined) {
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

        let plannedDeliveryDates = sanitizePlannedDeliveryDates(updated.plannedDeliveryDates);

        if (plannedRaw !== undefined) {
            plannedDeliveryDates = sanitizePlannedDeliveryDates(plannedRaw);
            await prisma.user.update({
                where: { id: updated.id },
                data: { plannedDeliveryDates },
            });

            // Sync scheda defunto collegata (se presente) — stessa lista date commemorative
            const linkedDeceasedIds = await prisma.order.findMany({
                where: {
                    OR: [
                        { userId: updated.id },
                        { buyerEmail: { equals: updated.email, mode: 'insensitive' } },
                    ],
                    deceasedProfileId: { not: null },
                },
                select: { deceasedProfileId: true },
                distinct: ['deceasedProfileId'],
            });
            const ids = linkedDeceasedIds
                .map((row) => row.deceasedProfileId)
                .filter((id): id is string => Boolean(id));
            if (ids.length > 0) {
                await prisma.deceasedProfile.updateMany({
                    where: { id: { in: ids } },
                    data: { plannedDeliveryDates },
                });
            }

            // Prima data futura → aggiorna anche deliveryDate sul prossimo ordine aperto (hint operativo)
            const firstFuture = plannedDeliveryDates[0];
            if (firstFuture) {
                await prisma.order.updateMany({
                    where: {
                        OR: [
                            { userId: updated.id },
                            { buyerEmail: { equals: updated.email, mode: 'insensitive' } },
                        ],
                        status: { in: ['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'DELIVERING'] },
                    },
                    data: { deliveryDate: new Date(firstFuture) },
                });
            }
        }

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
                phone: updated.phone ?? '',
                city: updated.city ?? '',
                userType: updated.userType,
                deliveryDate: toDateInput(latestOrder?.deliveryDate),
                plannedDeliveryDates,
            },
        });

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
