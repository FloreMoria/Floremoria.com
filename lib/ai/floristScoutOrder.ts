/**
 * Persistenza scout su Order.veraWorkflowFlags + email onboarding fioristi.
 * Destinatario: fioristi@floremoria.com (mai ordini@ — zona scoperta ≠ logistica).
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
import { staffFloristsEmail } from '@/lib/mail/staffMailRecipients';

const SCOUT_STALE_MS = 7 * 24 * 60 * 60 * 1000;

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
  const to = staffFloristsEmail();
  const subject = `[FloreMoria - Nuovo Fiorista Richiesto] Ordine ${input.orderNumber} - ${input.scout.cemetery}`;
  const html = buildFloristScoutStaffHtml({
    orderNumber: input.orderNumber,
    orderId: input.orderId,
    deceasedName: input.deceasedName,
    scout: input.scout,
  });

  const top = input.scout.recommendations[0];
  const result = await sendFloremTransactionalMail({
    to,
    subject,
    html,
    text: top
      ? `Ordine ${input.orderNumber}: contattare per primo ${top.name} — ${top.phone}`
      : `Ordine ${input.orderNumber}: zona non coperta — nessun candidato scout. Cimitero ${input.scout.cemetery}.`,
    emailType: 'florist_partner_search',
    orderNumber: input.orderNumber,
  });

  if (!result.ok) {
    console.error('[FloristScout] Email fioristi@ fallita:', result.error);
  }
}

/**
 * Esegue scout se ordine senza partner e salva in veraWorkflowFlags.suggestedFlorists.
 * Idempotente: non riscouta se già presente per lo stesso cimitero (7 giorni), salvo force.
 */
export async function runFloristScoutForOrder(
  orderId: string,
  opts?: { force?: boolean }
): Promise<{
  ran: boolean;
  recommendations: number;
  reason?: string;
  scout?: FloristScoutOrderPayload | null;
}> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    select: {
      id: true,
      orderNumber: true,
      deceasedName: true,
      cemeteryName: true,
      cemeteryCity: true,
      gravePosition: true,
      latitude: true,
      longitude: true,
      partnerId: true,
      status: true,
      veraWorkflowFlags: true,
    },
  });

  if (!order) return { ran: false, recommendations: 0, reason: 'order_not_found', scout: null };
  if (order.partnerId) {
    return { ran: false, recommendations: 0, reason: 'partner_assigned', scout: null };
  }
  if (order.status === 'CANCELLED') {
    return { ran: false, recommendations: 0, reason: 'cancelled', scout: null };
  }

  const existing = readFloristScoutFromFlags(order.veraWorkflowFlags);
  if (
    !opts?.force &&
    existing &&
    existing.cemetery.includes(order.cemeteryName) &&
    existing.scoutedAt &&
    Date.now() - new Date(existing.scoutedAt).getTime() < SCOUT_STALE_MS
  ) {
    return {
      ran: false,
      recommendations: existing.recommendations.length,
      reason: 'already_scouted',
      scout: existing,
    };
  }

  const scoutResult = await findNearbyFloristsForCemetery({
    cemeteryName: order.cemeteryName,
    city: order.cemeteryCity,
    address: order.gravePosition || undefined,
    latitude: order.latitude,
    longitude: order.longitude,
  });

  const payload: FloristScoutOrderPayload = {
    ...scoutResult,
    scoutedAt: new Date().toISOString(),
    source: 'florist_scout_ai',
    lookupMethod: scoutResult.lookupMethod,
    failureReason: scoutResult.failureReason || undefined,
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

  // Sempre notifica fioristi@ su zona scoperta (anche senza candidati Maps)
  await sendFloristScoutStaffEmail({
    orderNumber: order.orderNumber || order.id.slice(-8).toUpperCase(),
    orderId: order.id,
    deceasedName: order.deceasedName,
    scout: payload,
  }).catch((err) => {
    console.error('[FloristScout] Email non bloccante fallita:', err);
  });

  return {
    ran: true,
    recommendations: payload.recommendations.length,
    scout: payload,
    reason: scoutResult.failureReason || undefined,
  };
}

/** @deprecated Usare runFloristScoutForOrder — alias per checkout/sync automatici. */
export async function runFloristScoutForOrderIfNeeded(
  orderId: string
): Promise<{ ran: boolean; recommendations: number; reason?: string }> {
  const result = await runFloristScoutForOrder(orderId);
  return { ran: result.ran, recommendations: result.recommendations, reason: result.reason };
}
