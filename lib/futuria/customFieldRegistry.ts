/**
 * Risoluzione id → key per custom field contatto Futuria/GHL.
 */
import { getFuturiaLocationId } from './config';
import type { FuturiaCustomFieldEntry } from './deceasedContactFields';

interface LocationCustomFieldDef {
    id?: string;
    fieldKey?: string;
    key?: string;
    name?: string;
}

let cachedFieldIdByKey: Map<string, string> | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

function normalizeFieldLookupKey(key: string): string {
    return key.trim().toLowerCase();
}

function registerFieldId(map: Map<string, string>, key: string | undefined, id: string | undefined): void {
    if (!key?.trim() || !id?.trim()) return;
    const normalized = normalizeFieldLookupKey(key);
    map.set(normalized, id);
    const leaf = normalized.includes('.') ? normalized.split('.').pop()! : normalized;
    if (!map.has(leaf)) map.set(leaf, id);
}

async function loadLocationCustomFieldIds(
    fetchImpl: (path: string, init: RequestInit) => Promise<unknown>
): Promise<Map<string, string>> {
    const locationId = getFuturiaLocationId();
    if (!locationId) return new Map();

    try {
        const data = (await fetchImpl(
            `/locations/${locationId}/customFields?model=contact`,
            { method: 'GET' }
        )) as { customFields?: LocationCustomFieldDef[] };

        const map = new Map<string, string>();
        for (const field of data.customFields ?? []) {
            registerFieldId(map, field.fieldKey || field.key, field.id);
            if (field.name) {
                registerFieldId(map, field.name, field.id);
            }
        }
        return map;
    } catch (error) {
        // PIT senza scope locations: upsert procede con key-only sui custom field.
        console.warn(
            '[futuria] Impossibile caricare definizioni custom field (continuo con key):',
            error instanceof Error ? error.message : error
        );
        return new Map();
    }
}

/** Risolve gli id GHL necessari per una lista di fieldKey (con cache breve). */
export async function resolveFuturiaCustomFieldIds(
    fieldKeys: string[],
    fetchImpl: (path: string, init: RequestInit) => Promise<unknown>,
    existingFields?: FuturiaCustomFieldEntry[]
): Promise<Record<string, string | undefined>> {
    const now = Date.now();
    if (!cachedFieldIdByKey || now - cacheLoadedAt > CACHE_TTL_MS) {
        cachedFieldIdByKey = await loadLocationCustomFieldIds(fetchImpl);
        cacheLoadedAt = now;
    }

    const result: Record<string, string | undefined> = {};
    for (const key of fieldKeys) {
        const normalized = normalizeFieldLookupKey(key);
        const leaf = normalized.includes('.') ? normalized.split('.').pop()! : normalized;
        result[key] =
            cachedFieldIdByKey.get(normalized) ||
            cachedFieldIdByKey.get(leaf) ||
            existingFields
                ?.find((f) => {
                    const candidate = (f.key || f.fieldKey || '').toLowerCase();
                    return candidate === normalized || candidate.endsWith(`.${leaf}`);
                })
                ?.id;
    }
    return result;
}

/** Solo per test: azzera cache definizioni campi. */
export function resetFuturiaCustomFieldCacheForTests(): void {
    cachedFieldIdByKey = null;
    cacheLoadedAt = 0;
}
