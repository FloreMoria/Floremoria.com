/**
 * Fallback scout fioristi via Google Places API (Text Search + Details).
 * Usato quando Gemini+tools fallisce o non trova telefoni verificati.
 */
import {
  finalizeFloristScoutRecommendations,
  type FloristScoutRecommendation,
  type FloristScoutResult,
} from '@/lib/ai/floristScoutTypes';

type PlacesSearchResult = {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  geometry?: { location?: { lat?: number; lng?: number } };
  rating?: number;
  user_ratings_total?: number;
};

type PlacesDetailsResult = {
  name?: string;
  formatted_address?: string;
  formatted_phone_number?: string;
  international_phone_number?: string;
  rating?: number;
  user_ratings_total?: number;
  geometry?: { location?: { lat?: number; lng?: number } };
};

function getPlacesApiKey(): string | null {
  return process.env.GOOGLE_PLACES_API_KEY?.trim() || null;
}

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function distanceDescription(meters: number): string {
  if (meters <= 80) return "Di fronte all'ingresso o sul piazzale del cimitero";
  if (meters <= 250) return `Circa ${meters} m dal cimitero`;
  if (meters <= 1000) return `Circa ${Math.round(meters / 50) * 50} m dal cimitero`;
  return `Circa ${(meters / 1000).toFixed(1)} km dal cimitero`;
}

async function placesFetch<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function resolveCemeteryCoords(input: {
  cemeteryName: string;
  city: string;
  latitude?: number | null;
  longitude?: number | null;
}): Promise<{ lat: number; lng: number } | null> {
  if (
    typeof input.latitude === 'number' &&
    typeof input.longitude === 'number' &&
    Number.isFinite(input.latitude) &&
    Number.isFinite(input.longitude)
  ) {
    return { lat: input.latitude, lng: input.longitude };
  }

  const apiKey = getPlacesApiKey();
  if (!apiKey) return null;

  const query = encodeURIComponent(`${input.cemeteryName} cimitero ${input.city} Italia`);
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${apiKey}`;
  const data = await placesFetch<{ status?: string; results?: PlacesSearchResult[] }>(url);
  const loc = data?.results?.[0]?.geometry?.location;
  if (typeof loc?.lat === 'number' && typeof loc?.lng === 'number') {
    return { lat: loc.lat, lng: loc.lng };
  }
  return null;
}

async function fetchPlaceDetails(
  placeId: string,
  apiKey: string
): Promise<PlacesDetailsResult | null> {
  const fields = [
    'name',
    'formatted_address',
    'formatted_phone_number',
    'international_phone_number',
    'rating',
    'user_ratings_total',
    'geometry',
  ].join(',');
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=${fields}&language=it&key=${apiKey}`;
  const data = await placesFetch<{ status?: string; result?: PlacesDetailsResult }>(url);
  return data?.status === 'OK' ? data.result || null : null;
}

function buildSearchQueries(input: { cemeteryName: string; city: string }): string[] {
  const cemetery = input.cemeteryName.trim();
  const city = input.city.trim();
  return [
    `fiorista cimitero ${cemetery} ${city}`,
    `fioraio ${cemetery} ${city}`,
    `fiorista ${city} cimitero`,
    `fioraio ${city}`,
  ];
}

export async function findNearbyFloristsViaGooglePlaces(input: {
  cemeteryName: string;
  city: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): Promise<FloristScoutResult & { lookupMethod: 'google_places'; failureReason?: string }> {
  const cemeteryName = input.cemeteryName.trim();
  const city = input.city.trim();
  const cemeteryLabel = [cemeteryName, city].filter(Boolean).join(', ');

  const empty = {
    cemetery: cemeteryLabel,
    city,
    cemeteryCity: city,
    cemeteryAddress: input.address?.trim() || null,
    recommendations: [],
    lookupMethod: 'google_places' as const,
  };

  const apiKey = getPlacesApiKey();
  if (!apiKey) {
    return { ...empty, failureReason: 'GOOGLE_PLACES_API_KEY assente' };
  }

  const cemeteryCoords = await resolveCemeteryCoords(input);
  const seenPlaceIds = new Set<string>();
  const rawItems: Omit<FloristScoutRecommendation, 'rank'>[] = [];

  for (const queryText of buildSearchQueries(input)) {
    if (rawItems.length >= 5) break;

    const query = encodeURIComponent(queryText);
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&language=it&key=${apiKey}`;
    const data = await placesFetch<{
      status?: string;
      results?: PlacesSearchResult[];
      error_message?: string;
    }>(url);

    if (data?.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.warn('[FloristScoutPlaces]', data.status, data.error_message || '');
      continue;
    }

    for (const hit of data?.results || []) {
      if (!hit.place_id || seenPlaceIds.has(hit.place_id)) continue;
      seenPlaceIds.add(hit.place_id);

      const details = await fetchPlaceDetails(hit.place_id, apiKey);
      const phone =
        details?.international_phone_number?.trim() ||
        details?.formatted_phone_number?.trim() ||
        '';
      if (!phone) continue;

      const floristLoc = details?.geometry?.location || hit.geometry?.location;
      let distanceMeters = 99999;
      if (cemeteryCoords && floristLoc?.lat != null && floristLoc?.lng != null) {
        distanceMeters = haversineMeters(
          cemeteryCoords.lat,
          cemeteryCoords.lng,
          floristLoc.lat,
          floristLoc.lng
        );
      }

      rawItems.push({
        name: details?.name || hit.name || 'Fiorista',
        address: details?.formatted_address || hit.formatted_address || city,
        distanceMeters,
        distanceDescription: distanceDescription(distanceMeters),
        phone,
        rating: details?.rating ?? hit.rating ?? 0,
        reviewsCount: details?.user_ratings_total ?? hit.user_ratings_total ?? 0,
        aiReasoning:
          distanceMeters <= 250
            ? 'Trovato su Google Maps vicino al cimitero, con telefono pubblico verificato.'
            : 'Trovato su Google Maps nella zona del cimitero, con telefono pubblico verificato.',
        isDirectKiosk: distanceMeters <= 80,
      });

      if (rawItems.length >= 5) break;
    }
  }

  const recommendations = finalizeFloristScoutRecommendations(rawItems);

  console.info(`[FloristScoutPlaces] ${cemeteryLabel} → ${recommendations.length} candidati`);

  return {
    ...empty,
    recommendations,
    failureReason:
      recommendations.length === 0
        ? 'Google Places: nessun fiorista con telefono verificato'
        : undefined,
  };
}
