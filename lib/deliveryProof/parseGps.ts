/**
 * Normalizza lat/lng da FormData (stringhe decimali iPhone, virgola EU, numeri).
 */
export function parseGpsFormValue(raw: FormDataEntryValue | null): number | null {
    if (raw == null) return null;
    const normalized = String(raw).trim().replace(',', '.');
    if (!normalized) return null;
    const value = Number.parseFloat(normalized);
    if (!Number.isFinite(value)) return null;
    return value;
}

export function parseGpsPair(
    latRaw: FormDataEntryValue | null,
    lngRaw: FormDataEntryValue | null
): { gpsLatitude: number | null; gpsLongitude: number | null } {
    const lat = parseGpsFormValue(latRaw);
    const lng = parseGpsFormValue(lngRaw);
    if (lat == null || lng == null) {
        return { gpsLatitude: null, gpsLongitude: null };
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return { gpsLatitude: null, gpsLongitude: null };
    }
    return { gpsLatitude: lat, gpsLongitude: lng };
}
