/**
 * Assegna un candidato Scout AI come partner provvisorio sull'ordine.
 */
import prisma from '@/lib/prisma';
import { readFloristScoutFromFlags } from '@/lib/ai/floristScoutTypes';
import { onOrderStatusChanged } from '@/lib/orders/orderStatusFilter';

function phoneTail(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.slice(-9);
}

export async function assignScoutFloristToOrder(
  orderId: string,
  rank: number
): Promise<{ partnerId: string; shopName: string; created: boolean }> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    select: {
      id: true,
      status: true,
      cemeteryCity: true,
      cemeteryName: true,
      veraWorkflowFlags: true,
      partnerId: true,
    },
  });

  if (!order) throw new Error('order_not_found');

  const scout = readFloristScoutFromFlags(order.veraWorkflowFlags);
  const rec = scout?.recommendations.find((r) => r.rank === rank);
  if (!rec) throw new Error('scout_recommendation_not_found');

  const tail = phoneTail(rec.phone);
  let partner = tail
    ? await prisma.partner.findFirst({
        where: {
          deletedAt: null,
          OR: [
            { whatsappNumber: { contains: tail } },
            { shopName: { equals: rec.name, mode: 'insensitive' } },
          ],
        },
      })
    : null;

  let created = false;
  if (!partner) {
    partner = await prisma.partner.create({
      data: {
        shopName: rec.name.slice(0, 120),
        ownerName: rec.name.slice(0, 120),
        address: rec.address.slice(0, 255),
        whatsappNumber: rec.phone,
        coverageArea: order.cemeteryCity,
        internalNotes: `[Scout AI] ${rec.distanceDescription}. ${rec.aiReasoning}`.slice(0, 2000),
        partnershipChannel: 'Scout AI provvisorio',
        isActive: true,
        isB2B: false,
      },
    });
    created = true;
  }

  const nextStatus =
    order.status === 'ACCEPTED' || order.status === 'PENDING' ? 'IN_PROGRESS' : order.status;

  await prisma.order.update({
    where: { id: order.id },
    data: {
      partnerId: partner.id,
      ...(nextStatus !== order.status ? { status: nextStatus } : {}),
    },
  });

  if (nextStatus === 'IN_PROGRESS' && order.status !== 'IN_PROGRESS') {
    await onOrderStatusChanged(order.id, 'IN_PROGRESS').catch((err) => {
      console.error('[scout-assign] onOrderStatusChanged fallita:', err);
    });
  }

  return { partnerId: partner.id, shopName: partner.shopName, created };
}
