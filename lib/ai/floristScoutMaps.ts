/**
 * Link Google Maps per ricerca fioristi vicino al cimitero dell'ordine.
 */

export function buildFloristScoutGoogleMapsUrl(input: {
  cemeteryName?: string | null;
  cemeteryCity?: string | null;
  gravePosition?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): string {
  const cemetery = (input.cemeteryName || '').trim();
  const city = (input.cemeteryCity || '').trim();
  const grave = (input.gravePosition || '').trim();
  const lat = input.latitude;
  const lng = input.longitude;

  if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
    const q = encodeURIComponent(`fiorista vicino ${cemetery} ${city}`.trim() || 'fiorista');
    return `https://www.google.com/maps/search/${q}/@${lat},${lng},16z`;
  }

  const parts = ['fiorista', cemetery, city, grave].filter(Boolean);
  const query = parts.join(' ').trim() || 'fiorista cimitero';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function buildFloristDirectoryUrl(input: {
  cemeteryCity?: string | null;
  cemeteryName?: string | null;
}): string {
  const qs = new URLSearchParams();
  const city = (input.cemeteryCity || '').trim();
  const cemetery = (input.cemeteryName || '').trim();
  if (city) qs.set('city', city);
  if (cemetery) qs.set('cemetery', cemetery);
  const suffix = qs.toString();
  return suffix ? `/dashboard/fioristi?${suffix}` : '/dashboard/fioristi';
}
