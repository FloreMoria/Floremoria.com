import prisma from '@/lib/prisma';

export type VeraAlertType =
    | 'grave_position_missing'
    | 'tomb_not_found'
    | 'cemetery_closed'
    | 'user_modification_request'
    | 'workflow_blocked'
    | 'listino_missing'
    | 'florist_whatsapp_missing'
    | 'punto_a_send_failed';

export type VeraAlertPriority = 'normal' | 'high' | 'urgent';

export interface SetVeraOperationalAlertInput {
    orderId: string;
    type: VeraAlertType;
    message: string;
    priority?: VeraAlertPriority;
    freezeOrder?: boolean;
}

export async function setVeraOperationalAlert(input: SetVeraOperationalAlertInput): Promise<void> {
    const now = new Date();
    await prisma.order.update({
        where: { id: input.orderId },
        data: {
            veraAlertType: input.type,
            veraAlertMessage: input.message,
            veraAlertAt: now,
            veraAlertPriority: input.priority ?? 'high',
            ...(input.freezeOrder
                ? {
                      orderFrozenAt: now,
                      orderFrozenReason: input.message,
                  }
                : {}),
        },
    });
    console.warn(`[vera-alert] ${input.type} ordine ${input.orderId}: ${input.message}`);
}

export async function clearVeraOperationalAlert(orderId: string): Promise<void> {
    await prisma.order.update({
        where: { id: orderId },
        data: {
            veraAlertType: null,
            veraAlertMessage: null,
            veraAlertAt: null,
            veraAlertPriority: null,
            orderFrozenAt: null,
            orderFrozenReason: null,
        },
    });
}

export async function listActiveVeraAlerts(limit = 50) {
    return prisma.order.findMany({
        where: {
            deletedAt: null,
            veraAlertType: { not: null },
        },
        orderBy: { veraAlertAt: 'desc' },
        take: limit,
        select: {
            id: true,
            orderNumber: true,
            deceasedName: true,
            buyerFullName: true,
            veraAlertType: true,
            veraAlertMessage: true,
            veraAlertAt: true,
            veraAlertPriority: true,
            orderFrozenAt: true,
            partner: { select: { shopName: true } },
        },
    });
}
