import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { applyUserEmailChange, UserEmailUpdateError } from '@/lib/auth/userEmailUpdate';
import { normalizeMagicLinkEmail } from '@/lib/auth/magicLink';
import { updateFuturiaExistingContactIfPresent } from '@/lib/futuria/client';

export async function PUT(request: Request) {
    try {
        const body = await request.json();
        const { orderIds, name, phone, email } = body;

        if (!orderIds || !Array.isArray(orderIds)) {
            return NextResponse.json({ error: 'Missing orderIds' }, { status: 400 });
        }

        await prisma.order.updateMany({
            where: {
                id: { in: orderIds },
            },
            data: {
                buyerFullName: name,
                customerPhone: phone,
                ...(typeof email === 'string' && email.trim()
                    ? { buyerEmail: normalizeMagicLinkEmail(email) }
                    : {}),
            },
        });

        const affectedOrders = await prisma.order.findMany({
            where: { id: { in: orderIds }, userId: { not: null } },
            select: { userId: true },
        });

        const userIds = [...new Set(affectedOrders.map((o) => o.userId).filter(Boolean))] as string[];

        for (const userId of userIds) {
            const existingUser = await prisma.user.findUnique({ where: { id: userId } });
            if (!existingUser) continue;

            const nextEmail =
                typeof email === 'string' && email.trim()
                    ? normalizeMagicLinkEmail(email)
                    : existingUser.email;

            if (nextEmail !== existingUser.email) {
                await applyUserEmailChange({
                    userId: existingUser.id,
                    previousEmail: existingUser.email,
                    newEmail: nextEmail,
                    name: name ?? existingUser.name,
                    phone: phone ?? existingUser.phone,
                });
            }

            await prisma.user.update({
                where: { id: userId },
                data: {
                    name: name,
                    phone: phone,
                    ...(nextEmail !== existingUser.email ? { email: nextEmail } : {}),
                },
            });

            if (nextEmail === existingUser.email) {
                await updateFuturiaExistingContactIfPresent({
                    email: existingUser.email,
                    phone: phone ?? undefined,
                    name: name ?? undefined,
                });
            }
        }

        return NextResponse.json({ success: true, message: 'Dettagli Utente Sincronizzati' });
    } catch (error) {
        if (error instanceof UserEmailUpdateError) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        console.error('[sync-profile]', error);
        return NextResponse.json({ error: 'Errore interno' }, { status: 500 });
    }
}
