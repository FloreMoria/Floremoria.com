/**
 * PATCH /api/dashboard/user/deceased/[id]
 * Aggiorna birthDate/deathDate sul DeceasedProfile collegato all'Utente del Giardino.
 */
import { NextResponse } from 'next/server';
import { applySessionEmailCookie } from '@/lib/auth/sessionEmailCookie';
import { resolveSessionUser } from '@/lib/auth/sessionUser';
import { createUserFromOrder, findOrderByEmail } from '@/lib/auth/identity';
import prisma from '@/lib/prisma';
import {
    saveDeceasedCommemorativeDates,
    userCanEditDeceasedProfile,
} from '@/lib/deceased/saveDeceasedCommemorativeDates';
import { isDashboardAdminRole } from '@/lib/superAdmin';
import type { User } from '@prisma/client';

type IdContext = { params: Promise<{ id: string }> };

async function resolveBachecaUser(request: Request, body?: Record<string, unknown>): Promise<User | null> {
    const { user, email } = await resolveSessionUser();
    if (user) return user;

    let targetIdentifier = email || '';
    try {
        const url = new URL(request.url);
        targetIdentifier =
            targetIdentifier ||
            url.searchParams.get('email') ||
            url.searchParams.get('userId') ||
            url.searchParams.get('userCode') ||
            url.searchParams.get('token') ||
            '';
        if (!targetIdentifier && body) {
            targetIdentifier = String(
                body.userId || body.userCode || body.email || body.token || ''
            ).trim();
        }
    } catch {
        // ignore
    }
    if (!targetIdentifier) return null;

    const existing = await prisma.user.findFirst({
        where: {
            OR: [
                { email: targetIdentifier.toLowerCase() },
                { uniqueCode: targetIdentifier },
                { id: targetIdentifier },
            ],
        },
    });
    if (existing) return existing;

    const order = await findOrderByEmail(targetIdentifier.toLowerCase());
    if (!order) return null;
    try {
        return await createUserFromOrder(order);
    } catch {
        return null;
    }
}

export async function PATCH(request: Request, context: IdContext) {
    try {
        const { id: deceasedProfileId } = await context.params;
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const user = await resolveBachecaUser(request, body);
        if (!user) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        'Sessione non valida. Effettui di nuovo l\'accesso al Giardino della Memoria.',
                },
                { status: 401 }
            );
        }

        const isAdmin = isDashboardAdminRole(user.systemRole);
        if (!isAdmin) {
            const allowed = await userCanEditDeceasedProfile(
                user.id,
                user.email,
                deceasedProfileId
            );
            if (!allowed) {
                return NextResponse.json(
                    { success: false, message: 'Non autorizzato a modificare questo defunto.' },
                    { status: 403 }
                );
            }
        }

        const birthRaw =
            body.birthDate !== undefined ? body.birthDate : body.deceasedBirthDate;
        const deathRaw =
            body.deathDate !== undefined ? body.deathDate : body.deceasedDeathDate;

        const result = await saveDeceasedCommemorativeDates({
            deceasedProfileId,
            birthDate:
                birthRaw === undefined
                    ? undefined
                    : birthRaw == null
                      ? null
                      : String(birthRaw),
            deathDate:
                deathRaw === undefined
                    ? undefined
                    : deathRaw == null
                      ? null
                      : String(deathRaw),
        });

        const response = NextResponse.json({
            success: true,
            message: 'Date commemorative aggiornate.',
            deceased: {
                id: deceasedProfileId,
                birthDate: result.birthDate,
                deathDate: result.deathDate,
            },
        });
        applySessionEmailCookie(response, request, user.email);
        return response;
    } catch (error) {
        console.error('[user/deceased PATCH]', error);
        const message = error instanceof Error ? error.message : 'Errore interno.';
        return NextResponse.json({ success: false, message }, { status: 400 });
    }
}

export async function PUT(request: Request, context: IdContext) {
    return PATCH(request, context);
}
