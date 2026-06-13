/**
 * Garantisce un account USER per ogni ordine: riusa esistente o crea al volo.
 * Usato al checkout e al link FOTO post-consegna.
 */
import { Order, User, UserRole } from '@prisma/client';
import prisma from '../prisma';
import {
    createUserFromOrder,
    findUserByEmail,
    findUserByPhone,
    linkHistoricalOrders,
} from './identity';

export async function ensureUserForOrder(order: Order): Promise<User | null> {
    if (order.userId) {
        const linked = await prisma.user.findUnique({ where: { id: order.userId } });
        if (linked) {
            await linkHistoricalOrders(linked);
            return linked;
        }
    }

    let user: User | null = null;

    if (order.buyerEmail?.trim()) {
        user = await findUserByEmail(order.buyerEmail);
    }
    if (!user && order.customerPhone?.trim()) {
        user = await findUserByPhone(order.customerPhone);
    }
    if (!user) {
        user = await createUserFromOrder(order);
    }

    if (!user) return null;

    if (user.systemRole !== UserRole.USER) {
        return null;
    }

    if (!user.isActive) {
        await prisma.user.update({
            where: { id: user.id },
            data: { isActive: true, lastLoginAt: new Date() },
        });
    }

    await prisma.order.update({
        where: { id: order.id },
        data: { userId: user.id },
    });

    await linkHistoricalOrders(user);
    return user;
}

export async function ensureUserForOrderId(orderId: string): Promise<User | null> {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return null;
    return ensureUserForOrder(order);
}
