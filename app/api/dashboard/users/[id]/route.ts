import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { normalizeMagicLinkEmail } from '@/lib/auth/magicLink';

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const { id } = await context.params;
        const body = await request.json();

        const name = typeof body.name === 'string' ? body.name.trim() : undefined;
        const phone = typeof body.phone === 'string' ? body.phone.trim() : undefined;
        const email =
            typeof body.email === 'string' && body.email.trim()
                ? normalizeMagicLinkEmail(body.email)
                : undefined;

        const user = await prisma.user.findFirst({
            where: { id, deletedAt: null },
            select: { id: true, email: true },
        });
        if (!user) {
            return NextResponse.json({ ok: false, error: 'Utente non trovato.' }, { status: 404 });
        }

        await prisma.user.update({
            where: { id },
            data: {
                ...(name !== undefined ? { name } : {}),
                ...(phone !== undefined ? { phone } : {}),
                ...(email !== undefined ? { email } : {}),
            },
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

        return NextResponse.json({ ok: true });
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
