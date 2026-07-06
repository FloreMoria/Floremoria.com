import prisma from '@/lib/prisma';

/** True se questo è il primo ordine pagato/attivo assegnato al fiorista. */
export async function detectIsFirstOrderForPartner(
    orderId: string,
    partnerId: string
): Promise<boolean> {
    const priorCount = await prisma.order.count({
        where: {
            partnerId,
            deletedAt: null,
            id: { not: orderId },
            partnerPaymentStatus: 'PAID',
            status: { notIn: ['CANCELLED', 'PENDING'] },
        },
    });
    return priorCount === 0;
}

export async function persistFirstOrderFlag(orderId: string, isFirst: boolean): Promise<void> {
    await prisma.order.update({
        where: { id: orderId },
        data: { isFirstOrderForPartner: isFirst },
    });
}
