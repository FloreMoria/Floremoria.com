import type { Prisma } from '@prisma/client';

/** Prefisso ordini creati da integrazione Partner API v1 (non collide con checkout FF/FT). */
export async function generatePartnerTunnelOrderNumber(
    tx: Prisma.TransactionClient,
    deliveryProvince: string
): Promise<string> {
    const prov = (deliveryProvince || 'XX').substring(0, 2).toUpperCase();
    const year = new Date().getFullYear().toString().slice(-2);
    const basePattern = `PT-${prov}-${year}-`;
    const rows = await tx.order.findMany({
        where: { orderNumber: { startsWith: basePattern } },
        select: { orderNumber: true },
        take: 200,
    });

    let max = 0;
    for (const row of rows) {
        if (!row.orderNumber || !row.orderNumber.startsWith(basePattern)) continue;
        const suffix = row.orderNumber.slice(basePattern.length);
        const n = Number.parseInt(suffix, 10);
        if (Number.isFinite(n) && n > max) max = n;
    }

    const progressive = (max + 1).toString().padStart(3, '0');
    return `${basePattern}${progressive}`;
}
