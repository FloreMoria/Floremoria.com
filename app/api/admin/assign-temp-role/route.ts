import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getFloremAuthCookieBase } from '@/lib/authCookieDomain';
import { isBlockedSuperAdminAssignment } from '@/lib/superAdmin';
import { requireSuperAdminApi } from '@/lib/superAdminAuth';

export async function POST(request: Request) {
    const denied = await requireSuperAdminApi();
    if (denied) return denied;

    try {
        const body = await request.json();
        const { email, roleId, durationMins } = body;

        if (!email || !roleId || !durationMins) {
            return NextResponse.json({ error: 'Dati mancanti' }, { status: 400 });
        }

        const role = await prisma.role.findUnique({ where: { id: roleId } });
        if (!role) {
            return NextResponse.json({ error: 'Ruolo non trovato.' }, { status: 404 });
        }

        if (isBlockedSuperAdminAssignment(role.name)) {
            return NextResponse.json(
                {
                    error:
                        'Il ruolo SUPER_ADMIN non può essere assegnato dalla dashboard. Usa lo script offline: npm run master-key',
                },
                { status: 403 }
            );
        }

        const expiresAt = new Date(Date.now() + durationMins * 60 * 1000);
        const normalizedEmail = String(email).trim().toLowerCase();

        const user = await prisma.user.upsert({
            where: { email: normalizedEmail },
            update: { roleId, roleExpiresAt: expiresAt },
            create: {
                email: normalizedEmail,
                name: normalizedEmail.split('@')[0] || 'Invitato',
                roleId,
                roleExpiresAt: expiresAt,
            },
        });

        const response = NextResponse.json({ success: true, expiresAt, userId: user.id });

        const base = getFloremAuthCookieBase({ headers: request.headers, url: request.url });
        const opts = {
            path: base.path,
            ...(base.domain ? { domain: base.domain } : {}),
            secure: base.secure,
            sameSite: base.sameSite as 'lax',
            httpOnly: true,
        };
        response.cookies.set('fm_user_role', role.name, opts);
        response.cookies.set('fm_role_expires_at', expiresAt.toISOString(), opts);

        return response;
    } catch (error) {
        console.error('Assign temp role error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
