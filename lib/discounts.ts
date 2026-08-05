import type { Offer } from '@prisma/client';

type DiscountAudience = 'all' | 'single';

type OfferRules = {
  audience?: DiscountAudience;
  userEmail?: string;
  userName?: string;
  sendWhatsappLink?: boolean;
  whatsappNumber?: string;
  /** Limite usi per singolo acquirente (opzionale, in rulesJson). */
  maxUsesPerUser?: number;
};

export type DiscountResolution = {
  ok: boolean;
  reason?: string;
  discountCents: number;
  finalTotalCents: number;
};

export const OFFER_EXPIRED_ERROR = 'Il buono sconto inserito è scaduto';

export function normalizeOfferCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Validazione buono al checkout.
 * Generici (audience !== 'single'): qualsiasi utente, se attivo, non scaduto e entro i limiti d'uso.
 */
export function resolveOfferDiscount(params: {
  offer: Offer;
  subtotalCents: number;
  buyerEmail?: string;
  buyerFullName?: string;
  usageCount?: number;
  /** Utilizzi già fatti da questo acquirente (email), per maxUsesPerUser. */
  userUsageCount?: number;
  now?: Date;
}): DiscountResolution {
  const {
    offer,
    subtotalCents,
    buyerEmail = '',
    buyerFullName = '',
    usageCount = 0,
    userUsageCount = 0,
    now = new Date(),
  } = params;
  const safeSubtotal = Math.max(0, Math.round(subtotalCents));
  const normalizedEmail = buyerEmail.trim().toLowerCase();
  const normalizedName = buyerFullName.trim().toLowerCase();

  if (!offer.isActive || offer.deletedAt) {
    return { ok: false, reason: 'Codice non attivo.', discountCents: 0, finalTotalCents: safeSubtotal };
  }
  if (offer.startsAt && now < offer.startsAt) {
    return { ok: false, reason: 'Codice non ancora valido.', discountCents: 0, finalTotalCents: safeSubtotal };
  }
  // Scadenza rigorosa: valido solo se now <= endsAt.
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

  let discountCents = 0;
  if (offer.type === 'PERCENT') {
    discountCents = Math.round((safeSubtotal * offer.value) / 100);
  } else {
    discountCents = offer.value;
  }

  discountCents = Math.max(0, Math.min(discountCents, safeSubtotal));
  return {
    ok: true,
    discountCents,
    finalTotalCents: safeSubtotal - discountCents,
  };
}
