import type { Offer, OfferGrant } from '@prisma/client';
import { normalizePhoneE164 } from '@/lib/whatsapp/metaCloudApiClient';

type DiscountAudience = 'all' | 'single';

type OfferRules = {
  audience?: DiscountAudience;
  userEmail?: string;
  userName?: string;
  sendWhatsappLink?: boolean;
  whatsappNumber?: string;
  maxUsesPerUser?: number;
};

export type DiscountResolution = {
  ok: boolean;
  reason?: string;
  discountCents: number;
  finalTotalCents: number;
  grantId?: string;
};

export const OFFER_EXPIRED_ERROR = 'Il buono sconto inserito è scaduto';

export function normalizeOfferCode(code: string): string {
  return code.trim().toUpperCase();
}

export function computeOfferEndsAt(
  duration: '1w' | '1m' | '3m' | '6m' | '1y',
  from: Date = new Date()
): Date {
  const next = new Date(from);
  if (duration === '1w') next.setDate(next.getDate() + 7);
  if (duration === '1m') next.setMonth(next.getMonth() + 1);
  if (duration === '3m') next.setMonth(next.getMonth() + 3);
  if (duration === '6m') next.setMonth(next.getMonth() + 6);
  if (duration === '1y') next.setFullYear(next.getFullYear() + 1);
  return next;
}

function computeDiscountCents(offer: Offer, safeSubtotal: number): number {
  let discountCents = 0;
  if (offer.type === 'PERCENT') {
    discountCents = Math.round((safeSubtotal * offer.value) / 100);
  } else {
    discountCents = offer.value;
  }
  return Math.max(0, Math.min(discountCents, safeSubtotal));
}

/**
 * Validazione buono al checkout.
 *
 * Se esiste un'assegnazione personale (OfferGrant) per telefono/email:
 *   → scadenza e limiti sono quelli del grant (Pinco 6 mesi ≠ Cinciallegra 3 mesi).
 * Altrimenti fallback sul buono globale (endsAt / maxUses dell'Offer).
 */
export function resolveOfferDiscount(params: {
  offer: Offer;
  subtotalCents: number;
  buyerEmail?: string;
  buyerFullName?: string;
  buyerPhone?: string;
  usageCount?: number;
  userUsageCount?: number;
  /** Grant personale risolto per questo destinatario (opzionale). */
  grant?: Pick<OfferGrant, 'id' | 'endsAt' | 'startsAt' | 'maxUses'> | null;
  grantUsageCount?: number;
  now?: Date;
}): DiscountResolution {
  const {
    offer,
    subtotalCents,
    buyerEmail = '',
    buyerFullName = '',
    usageCount = 0,
    userUsageCount = 0,
    grant = null,
    grantUsageCount = 0,
    now = new Date(),
  } = params;
  const safeSubtotal = Math.max(0, Math.round(subtotalCents));
  const normalizedEmail = buyerEmail.trim().toLowerCase();
  const normalizedName = buyerFullName.trim().toLowerCase();

  if (!offer.isActive || offer.deletedAt) {
    return { ok: false, reason: 'Codice non attivo.', discountCents: 0, finalTotalCents: safeSubtotal };
  }

  // —— Percorso personale: scadenza e usi legati al destinatario ——
  if (grant) {
    if (grant.startsAt && now < grant.startsAt) {
      return { ok: false, reason: 'Codice non ancora valido.', discountCents: 0, finalTotalCents: safeSubtotal };
    }
    if (now.getTime() > grant.endsAt.getTime()) {
      return { ok: false, reason: OFFER_EXPIRED_ERROR, discountCents: 0, finalTotalCents: safeSubtotal };
    }
    if (grant.maxUses > 0 && grantUsageCount >= grant.maxUses) {
      return {
        ok: false,
        reason: 'Hai già utilizzato questo buono sconto.',
        discountCents: 0,
        finalTotalCents: safeSubtotal,
      };
    }
    const discountCents = computeDiscountCents(offer, safeSubtotal);
    return {
      ok: true,
      discountCents,
      finalTotalCents: safeSubtotal - discountCents,
      grantId: grant.id,
    };
  }

  // —— Percorso globale (buono senza grant personale) ——
  if (offer.startsAt && now < offer.startsAt) {
    return { ok: false, reason: 'Codice non ancora valido.', discountCents: 0, finalTotalCents: safeSubtotal };
  }
  if (offer.endsAt && now.getTime() > offer.endsAt.getTime()) {
    return { ok: false, reason: OFFER_EXPIRED_ERROR, discountCents: 0, finalTotalCents: safeSubtotal };
  }
  if (typeof offer.maxUses === 'number' && offer.maxUses > 0 && usageCount >= offer.maxUses) {
    return { ok: false, reason: 'Codice sconto esaurito.', discountCents: 0, finalTotalCents: safeSubtotal };
  }

  const rules = (offer.rulesJson ?? {}) as OfferRules;
  const maxUsesPerUser =
    typeof rules.maxUsesPerUser === 'number' && Number.isFinite(rules.maxUsesPerUser)
      ? Math.floor(rules.maxUsesPerUser)
      : null;
  if (maxUsesPerUser !== null && maxUsesPerUser > 0 && userUsageCount >= maxUsesPerUser) {
    return {
      ok: false,
      reason: 'Hai già utilizzato questo buono sconto il numero massimo di volte consentito.',
      discountCents: 0,
      finalTotalCents: safeSubtotal,
    };
  }

  if (rules.audience === 'single') {
    const targetEmail = (rules.userEmail ?? '').trim().toLowerCase();
    const targetName = (rules.userName ?? '').trim().toLowerCase();
    const emailMatch = targetEmail && normalizedEmail === targetEmail;
    const nameMatch = targetName && normalizedName.includes(targetName);
    if (!emailMatch && !nameMatch) {
      return { ok: false, reason: 'Codice non valido per questo utente.', discountCents: 0, finalTotalCents: safeSubtotal };
    }
  }

  const discountCents = computeDiscountCents(offer, safeSubtotal);
  return {
    ok: true,
    discountCents,
    finalTotalCents: safeSubtotal - discountCents,
  };
}

/** Trova grant attivo per telefono (preferito) o email. */
export async function findOfferGrantForBuyer(input: {
  offerId: string;
  buyerPhone?: string | null;
  buyerEmail?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma: { offerGrant: { findFirst: (args: any) => Promise<OfferGrant | null> } };
}): Promise<OfferGrant | null> {
  const phoneE164 = normalizePhoneE164(input.buyerPhone);
  if (phoneE164) {
    const byPhone = await input.prisma.offerGrant.findFirst({
      where: { offerId: input.offerId, recipientPhone: phoneE164 },
    });
    if (byPhone) return byPhone;
  }

  const email = input.buyerEmail?.trim().toLowerCase();
  if (email) {
    return input.prisma.offerGrant.findFirst({
      where: {
        offerId: input.offerId,
        recipientEmail: { equals: email, mode: 'insensitive' },
      },
      orderBy: { endsAt: 'desc' },
    });
  }

  return null;
}
