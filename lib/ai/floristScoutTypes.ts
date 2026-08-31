/**
 * Tipi Florist Scout AI — candidati fioristi di prossimità al cimitero.
 * Persistenza in Order.veraWorkflowFlags.suggestedFlorists (Order non ha colonna metadata).
 */

export type FloristScoutRecommendation = {
  rank: number;
  name: string;
  address: string;
  distanceMeters: number;
  distanceDescription: string;
  phone: string;
  rating: number;
  reviewsCount: number;
  aiReasoning: string;
  isDirectKiosk: boolean;
};

export type FloristScoutResult = {
  cemetery: string;
  city: string;
  cemeteryCity: string;
  cemeteryAddress?: string | null;
  recommendations: FloristScoutRecommendation[];
};

export type FloristScoutOrderPayload = FloristScoutResult & {
  scoutedAt: string;
  source: 'florist_scout_ai';
  lookupMethod?: 'gemini' | 'google_places' | 'none';
  failureReason?: string;
};

export function readFloristScoutFromFlags(
  flags: unknown
): FloristScoutOrderPayload | null {
  if (!flags || typeof flags !== 'object' || Array.isArray(flags)) return null;
  const raw = (flags as Record<string, unknown>).suggestedFlorists;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.recommendations)) return null;
  const resolvedCity = String(o.city || o.cemeteryCity || '');
  return {
    cemetery: String(o.cemetery || ''),
    city: resolvedCity,
    cemeteryCity: resolvedCity,
    cemeteryAddress: o.cemeteryAddress ? String(o.cemeteryAddress) : null,
    scoutedAt: String(o.scoutedAt || ''),
    source: 'florist_scout_ai',
    recommendations: o.recommendations
      .filter((r): r is Record<string, unknown> => r && typeof r === 'object')
      .map((r, idx) => ({
        rank: Number(r.rank) || idx + 1,
        name: String(r.name || ''),
        address: String(r.address || ''),
        distanceMeters: Number(r.distanceMeters) || 99999,
        distanceDescription: String(r.distanceDescription || ''),
        phone: String(r.phone || ''),
        rating: Number(r.rating) || 0,
        reviewsCount: Number(r.reviewsCount) || 0,
        aiReasoning: String(r.aiReasoning || ''),
        isDirectKiosk: Boolean(r.isDirectKiosk),
      }))
      .filter((r) => r.name && r.phone),
  };
}

/** Normalizza telefono IT per tel: e display. */
export function normalizeFloristPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8) return null;
  if (digits.startsWith('39') && digits.length >= 10) return `+${digits}`;
  if (digits.startsWith('0')) return `+39${digits.slice(1)}`;
  if (digits.length >= 9) return `+39${digits}`;
  return null;
}

/** Ordina e filtra: telefono obbligatorio, distanza primaria, max 3. */
export function finalizeFloristScoutRecommendations(
  items: Omit<FloristScoutRecommendation, 'rank'>[]
): FloristScoutRecommendation[] {
  const withPhone = items
    .map((item) => {
      const phone = normalizeFloristPhone(item.phone);
      if (!phone) return null;
      return { ...item, phone };
    })
    .filter(Boolean) as Omit<FloristScoutRecommendation, 'rank'>[];

  withPhone.sort((a, b) => {
    const dist = a.distanceMeters - b.distanceMeters;
    if (dist !== 0) return dist;
    if (a.isDirectKiosk !== b.isDirectKiosk) return a.isDirectKiosk ? -1 : 1;
    return (b.rating || 0) - (a.rating || 0);
  });

  return withPhone.slice(0, 3).map((item, idx) => ({
    ...item,
    rank: idx + 1,
  }));
}
