/**
 * Logica append-only per associare più defunti allo stesso contatto Futuria/GHL.
 * Non sovrascrive nomi già registrati negli slot progressivi (Defunto, Defunto_2, …).
 */
import {
    getFuturiaDeceasedFieldConfig,
    type FuturiaDeceasedFieldConfig,
} from './config';

export interface FuturiaCustomFieldEntry {
    id?: string;
    key?: string;
    fieldKey?: string;
    value?: string | string[] | number | null;
    field_value?: string | string[] | number | null;
}

export interface FuturiaCustomFieldWrite {
    id?: string;
    key: string;
    field_value: string;
}

/** Normalizza per confronto deduplica (case-insensitive, spazi collassati). */
export function normalizeDeceasedName(name: string): string {
    return name.trim().replace(/\s+/g, ' ');
}

function normalizeDeceasedKey(key: string): string {
    return key.trim().toLowerCase();
}

/** Legge il valore testuale di un custom field dal contatto esistente. */
export function readFuturiaCustomFieldValue(
    fields: FuturiaCustomFieldEntry[] | undefined,
    fieldKey: string
): string | null {
    if (!fields?.length || !fieldKey.trim()) return null;
    const target = normalizeDeceasedKey(fieldKey);
    const targetSuffix = target.includes('.') ? target.split('.').pop()! : target;

    for (const field of fields) {
        const candidateKey = field.key || field.fieldKey;
        if (!candidateKey) continue;
        const normalized = normalizeDeceasedKey(candidateKey);
        if (
            normalized === target ||
            normalized.endsWith(`.${targetSuffix}`) ||
            normalized.endsWith(`_${targetSuffix}`)
        ) {
            const raw = field.field_value ?? field.value;
            if (raw == null) return null;
            if (Array.isArray(raw)) return raw.map(String).join('\n').trim() || null;
            return String(raw).trim() || null;
        }
    }
    return null;
}

/** Estrae l'id GHL di un custom field già presente sul contatto. */
export function readFuturiaCustomFieldId(
    fields: FuturiaCustomFieldEntry[] | undefined,
    fieldKey: string
): string | undefined {
    if (!fields?.length) return undefined;
    const target = normalizeDeceasedKey(fieldKey);
    const targetSuffix = target.includes('.') ? target.split('.').pop()! : target;

    for (const field of fields) {
        const candidateKey = field.key || field.fieldKey;
        if (!candidateKey || !field.id) continue;
        const normalized = normalizeDeceasedKey(candidateKey);
        if (
            normalized === target ||
            normalized.endsWith(`.${targetSuffix}`) ||
            normalized.endsWith(`_${targetSuffix}`)
        ) {
            return field.id;
        }
    }
    return undefined;
}

/** Storico aggregato: una riga per defunto. */
export function parseDeceasedHistory(raw: string | null | undefined): string[] {
    if (!raw?.trim()) return [];
    return raw
        .split(/\r?\n|[|;,]/)
        .map((part) => normalizeDeceasedName(part))
        .filter(Boolean);
}

function dedupeDeceasedNames(names: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const name of names) {
        const normalized = normalizeDeceasedName(name);
        if (!normalized) continue;
        const key = normalized.toLocaleLowerCase('it-IT');
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(normalized);
    }
    return result;
}

/** Chiavi slot progressivi: defunto, defunto_2, defunto_3, … */
export function buildDeceasedSlotKeys(config: FuturiaDeceasedFieldConfig): string[] {
    const keys = [config.defuntoKey];
    for (let slot = 2; slot <= config.maxProgressiveSlots; slot += 1) {
        keys.push(deriveProgressiveDeceasedKey(config.defuntoKey, slot));
    }
    return keys;
}

/** Es. contact.defunto → contact.defunto_2 */
export function deriveProgressiveDeceasedKey(baseKey: string, slot: number): string {
    if (slot <= 1) return baseKey;
    if (baseKey.includes('.')) {
        const parts = baseKey.split('.');
        const leaf = parts.pop() || 'defunto';
        parts.push(`${leaf}_${slot}`);
        return parts.join('.');
    }
    return `${baseKey}_${slot}`;
}

export interface BuildDeceasedFieldsInput {
    existingCustomFields?: FuturiaCustomFieldEntry[];
    newDeceasedName: string;
    fieldIdMap?: Record<string, string | undefined>;
    config?: FuturiaDeceasedFieldConfig;
}

export interface BuildDeceasedFieldsResult {
    customFields: FuturiaCustomFieldWrite[];
    /** true se il nome era già presente nello storico/slot */
    alreadyRegistered: boolean;
    /** Nomi in ordine cronologico dopo l'operazione */
    deceasedHistory: string[];
}

/**
 * Costruisce il payload customFields per upsert:
 * - storico testuale append-only
 * - slot progressivi (primo vuoto disponibile)
 * - defunto_ultimo sempre aggiornato all'ordine corrente
 */
export function buildDeceasedCustomFieldsPayload(
    input: BuildDeceasedFieldsInput
): BuildDeceasedFieldsResult {
    const config = input.config ?? getFuturiaDeceasedFieldConfig();
    const newName = normalizeDeceasedName(input.newDeceasedName);
    if (!newName) {
        return { customFields: [], alreadyRegistered: false, deceasedHistory: [] };
    }

    const slotKeys = buildDeceasedSlotKeys(config);
    const existingFields = input.existingCustomFields;

    const storicoRaw = readFuturiaCustomFieldValue(existingFields, config.storicoKey);
    const fromStorico = parseDeceasedHistory(storicoRaw);
    const fromSlots = slotKeys
        .map((key) => readFuturiaCustomFieldValue(existingFields, key))
        .filter((value): value is string => Boolean(value?.trim()));

    const previousHistory = dedupeDeceasedNames([...fromStorico, ...fromSlots]);
    const newKey = newName.toLocaleLowerCase('it-IT');
    const alreadyRegistered = previousHistory.some(
        (name) => name.toLocaleLowerCase('it-IT') === newKey
    );

    const deceasedHistory = alreadyRegistered
        ? previousHistory
        : dedupeDeceasedNames([...previousHistory, newName]);

    const valuesByKey = new Map<string, string>();

    valuesByKey.set(config.storicoKey, deceasedHistory.join('\n'));
    valuesByKey.set(config.defuntoUltimoKey, newName);

    if (!alreadyRegistered) {
        const slotValues = slotKeys.map((key) =>
            readFuturiaCustomFieldValue(existingFields, key)
        );
        let assigned = false;
        for (let i = 0; i < slotKeys.length; i += 1) {
            const key = slotKeys[i]!;
            const current = slotValues[i]?.trim();
            if (current) {
                valuesByKey.set(key, normalizeDeceasedName(current));
                continue;
            }
            if (!assigned) {
                valuesByKey.set(key, newName);
                assigned = true;
            }
        }
    } else {
        for (const key of slotKeys) {
            const current = readFuturiaCustomFieldValue(existingFields, key);
            if (current) valuesByKey.set(key, normalizeDeceasedName(current));
        }
    }

    const customFields: FuturiaCustomFieldWrite[] = [];
    for (const [key, value] of valuesByKey) {
        if (!value.trim()) continue;
        const entry: FuturiaCustomFieldWrite = {
            key,
            field_value: value,
        };
        const id =
            input.fieldIdMap?.[key] ||
            readFuturiaCustomFieldId(existingFields, key);
        if (id) entry.id = id;
        customFields.push(entry);
    }

    return { customFields, alreadyRegistered, deceasedHistory };
}
