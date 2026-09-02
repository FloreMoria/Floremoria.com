import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { normalizeMagicLinkEmail } from '@/lib/auth/magicLink';
import { isProfileUserType } from '@/lib/users/profileUserType';
import { formatPersonName } from '@/lib/utils/formatPersonName';

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const { id } = await context.params;
        const body = await request.json();

        const name = typeof body.name === 'string' ? formatPersonName(body.name) : undefined;
        const phone = typeof body.phone === 'string' ? body.phone.trim() : undefined;
        const email =
            typeof body.email === 'string' && body.email.trim()
                ? normalizeMagicLinkEmail(body.email)
                : undefined;
        const userType = isProfileUserType(body.userType) ? body.userType : undefined;

        const user = await prisma.user.findFirst({
            where: { id, deletedAt: null },
            select: { id: true, email: true },
        });
        if (!user) {
            return NextResponse.json({ ok: false, error: 'Utente non trovato.' }, { status: 404 });
        }

        const updated = await prisma.user.update({
            where: { id },
            data: {
                ...(name !== undefined ? { name } : {}),
                ...(phone !== undefined ? { phone } : {}),
                ...(email !== undefined ? { email } : {}),
                ...(userType !== undefined ? { userType } : {}),
            },
            select: { id: true, userType: true, name: true, email: true, phone: true },
        });

        if (name !== undefined || phone !== undefined || email !== undefined) {
            await prisma.order.updateMany({
                where: { userId: id },
                data: {
                    ...(name !== undefined ? { buyerFullName: name } : {}),
                    ...(phone !== undefined ? { customerPhone: phone } : {}),
                    ...(email !== undefined ? { buyerEmail: email } : {}),
                },
            });
        }

        return NextResponse.json({ ok: true, user: updated });
    } catch (error) {
        console.error('[dashboard/users/:id PUT]', error);
        const message = error instanceof Error ? error.message : 'Aggiornamento non riuscito.';
        return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const { id } = await context.params;

        const linkedOrders = await prisma.order.count({
            where: { userId: id, deletedAt: null },
        });

        if (linkedOrders > 0) {
            return NextResponse.json(
                {
                    ok: false,
                    error: 'Impossibile cancellare un utente con ordini associati.',
                },
                { status: 400 }
            );
        }

        await prisma.user.update({
            where: { id },
            data: { deletedAt: new Date(), isActive: false },
        });

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('[dashboard/users/:id DELETE]', error);
        const message = error instanceof Error ? error.message : 'Cancellazione non riuscita.';
        return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
}
