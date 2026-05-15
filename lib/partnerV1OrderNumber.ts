import type { Prisma } from '@prisma/client';

/** Prefisso ordini creati da integrazione Partner API v1 (non collide con checkout FF/FT). */
export async function generatePartnerTunnelOrderNumber(
    tx: Prisma.TransactionClient,
    deliveryProvince: string
): Promise<string> {
    const prov = (deliveryProvince || 'XX').substring(0, 2).toUpperCase();
    const year = new Date().getFullYear().toString().slice(-2);
    const basePattern = `PT-${prov}-${year}-`;
    const count = await tx.order.count({
        where: { orderNumber: { startsWith: basePattern } },
    });
    const progressive = (count + 1).toString().padStart(3, '0');
    return `${basePattern}${progressive}`;
}
