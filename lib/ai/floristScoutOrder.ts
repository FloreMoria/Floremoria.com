/**
 * Persistenza scout su Order.veraWorkflowFlags + email operatore.
 */
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { findNearbyFloristsForCemetery } from '@/lib/ai/floristScout';
import {
  readFloristScoutFromFlags,
  type FloristScoutOrderPayload,
} from '@/lib/ai/floristScoutTypes';
import { buildFloristScoutStaffHtml } from '@/lib/orderEmails';
import { sendFloremTransactionalMail } from '@/lib/serverMail';

const SCOUT_STALE_MS = 7 * 24 * 60 * 60 * 1000;

function staffOrdersEmail(): string {
  return (
    process.env.FLOREM_STAFF_ORDERS_EMAIL?.trim() ||
    process.env.FLOREM_MAIL_REPLY_TO?.trim() ||
    'ordini@floremoria.com'
  );
}

function mergeFlags(
  existing: unknown,
  patch: Record<string, unknown>
): Prisma.InputJsonValue {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};
  return { ...base, ...patch } as Prisma.InputJsonValue;
}

async function sendFloristScoutStaffEmail(input: {
  orderNumber: string;
  orderId: string;
  deceasedName: string;
  scout: FloristScoutOrderPayload;
}): Promise<void> {
  if (!input.scout.recommendations.length) return;

  const subject = `[FloreMoria - Nuovo Fiorista Richiesto] Ordine ${input.orderNumber} - ${input.scout.cemetery}`;
  const html = buildFloristScoutStaffHtml({
    orderNumber: input.orderNumber,
    orderId: input.orderId,
    deceasedName: input.deceasedName,
    scout: input.scout,
  });

  const result = await sendFloremTransactionalMail({
    to: staffOrdersEmail(),
    subject,
    html,
    text: `Ordine ${input.orderNumber}: contattare per primo ${input.scout.recommendations[0]?.name} — ${input.scout.recommendations[0]?.phone}`,
  });

  if (!result.ok) {
    console.error('[FloristScout] Email operatore fallita:', result.error);
  }
}

/**
 * Esegue scout se ordine senza partner e salva in veraWorkflowFlags.suggestedFlorists.
 * Idempotente: non riscouta se già presente per lo stesso cimitero (7 giorni).
 */
export async function runFloristScoutForOrderIfNeeded(
  orderId: string
): Promise<{ ran: boolean; recommendations: number; reason?: string }> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    select: {
      id: true,
      orderNumber: true,
      deceasedName: true,
      cemeteryName: true,
      cemeteryCity: true,
      gravePosition: true,
      partnerId: true,
      status: true,
      veraWorkflowFlags: true,
    },
  });

  if (!order) return { ran: false, recommendations: 0, reason: 'order_not_found' };
  if (order.partnerId) return { ran: false, recommendations: 0, reason: 'partner_assigned' };
  if (order.status === 'CANCELLED') {
    return { ran: false, recommendations: 0, reason: 'cancelled' };
  }

  const existing = readFloristScoutFromFlags(order.veraWorkflowFlags);
  if (
    existing &&
    existing.cemetery.includes(order.cemeteryName) &&
    existing.scoutedAt &&
    Date.now() - new Date(existing.scoutedAt).getTime() < SCOUT_STALE_MS
  ) {
    return {
      ran: false,
      recommendations: existing.recommendations.length,
      reason: 'already_scouted',
    };
  }

  const scoutResult = await findNearbyFloristsForCemetery({
    cemeteryName: order.cemeteryName,
    city: order.cemeteryCity,
    address: order.gravePosition || undefined,
  });

  const payload: FloristScoutOrderPayload = {
    ...scoutResult,
    scoutedAt: new Date().toISOString(),
    source: 'florist_scout_ai',
  };

  await prisma.order.update({
    where: { id: order.id },
    data: {
      veraWorkflowFlags: mergeFlags(order.veraWorkflowFlags, {
        suggestedFlorists: payload,
        floristScoutAt: payload.scoutedAt,
      }),
    },
  });

  if (payload.recommendations.length > 0) {
    await sendFloristScoutStaffEmail({
      orderNumber: order.orderNumber || order.id.slice(-8).toUpperCase(),
      orderId: order.id,
      deceasedName: order.deceasedName,
      scout: payload,
    }).catch((err) => {
      console.error('[FloristScout] Email non bloccante fallita:', err);
    });
  }

  return { ran: true, recommendations: payload.recommendations.length };
}
