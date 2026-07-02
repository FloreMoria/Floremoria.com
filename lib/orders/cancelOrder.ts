import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';

/** Ordine annullato dall'admin (soft-delete + stato CANCELLED). */
export async function cancelDashboardOrder(orderId: string) {
    const order = await prisma.order.update({
        where: { id: orderId },
        data: {
            status: 'CANCELLED',
            deletedAt: new Date(),
        },
        select: {
            id: true,
            orderNumber: true,
            partnerId: true,
            deletedAt: true,
            status: true,
        },
    });

    revalidatePath('/dashboard/orders');
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/users');
    revalidatePath('/dashboard/defunti');
    revalidatePath('/dashboard/user');
    revalidatePath('/dashboard/fioristi');
    if (order.partnerId) {
        revalidatePath(`/dashboard/fioristi/${order.partnerId}`);
    }
    if (order.orderNumber) {
        revalidatePath(`/fiorista/consegna/${order.orderNumber}`);
    }
    revalidatePath(`/fiorista/consegna/${order.id}`);

    return order;
}

export async function cancelDashboardOrderByNumber(orderNumber: string) {
    const order = await prisma.order.findFirst({
        where: { orderNumber: { equals: orderNumber.trim(), mode: 'insensitive' } },
        select: { id: true },
    });
    if (!order) return null;
    return cancelDashboardOrder(order.id);
}
