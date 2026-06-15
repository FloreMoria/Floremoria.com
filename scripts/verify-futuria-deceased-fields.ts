/**
 * Verifica offline della logica append defunti (senza chiamate Futuria).
 * Uso: npx tsx scripts/verify-futuria-deceased-fields.ts
 */
import {
    buildDeceasedCustomFieldsPayload,
    buildDeceasedSlotKeys,
    readFuturiaCustomFieldValue,
    type FuturiaCustomFieldEntry,
} from '../lib/futuria/deceasedContactFields';
import type { FuturiaDeceasedFieldConfig } from '../lib/futuria/config';

const TEST_CONFIG: FuturiaDeceasedFieldConfig = {
    storicoKey: 'contact.defunti_storico',
    defuntoKey: 'contact.defunto',
    defuntoUltimoKey: 'contact.defunto_ultimo',
    maxProgressiveSlots: 5,
};

function assert(condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(`ASSERT FAIL: ${message}`);
    }
}

function fieldMap(fields: { key: string; field_value: string }[]): Record<string, string> {
    return Object.fromEntries(fields.map((f) => [f.key, f.field_value]));
}

function runScenario(
    label: string,
    existing: FuturiaCustomFieldEntry[],
    newName: string,
    expectations: {
        alreadyRegistered?: boolean;
        storico: string[];
        defunto: string;
        defunto2?: string;
        ultimo: string;
    }
): void {
    const result = buildDeceasedCustomFieldsPayload({
        existingCustomFields: existing,
        newDeceasedName: newName,
        config: TEST_CONFIG,
    });
    const map = fieldMap(result.customFields);

    assert(
        result.alreadyRegistered === (expectations.alreadyRegistered ?? false),
        `${label}: alreadyRegistered`
    );
    assert(
        result.deceasedHistory.join('|') === expectations.storico.join('|'),
        `${label}: storico atteso ${expectations.storico.join('|')} got ${result.deceasedHistory.join('|')}`
    );
    assert(map[TEST_CONFIG.storicoKey] === expectations.storico.join('\n'), `${label}: storico field`);
    assert(map[TEST_CONFIG.defuntoKey] === expectations.defunto, `${label}: defunto slot 1`);
    if (expectations.defunto2 !== undefined) {
        const slot2 = buildDeceasedSlotKeys(TEST_CONFIG)[1]!;
        assert(map[slot2] === expectations.defunto2, `${label}: defunto slot 2`);
    }
    assert(map[TEST_CONFIG.defuntoUltimoKey] === expectations.ultimo, `${label}: defunto ultimo`);
    console.log(`✓ ${label}`);
}

const existingMario: FuturiaCustomFieldEntry[] = [
    { id: 'cf1', key: 'contact.defunto', value: 'Mario Rossi' },
    { id: 'cf2', key: 'contact.defunti_storico', value: 'Mario Rossi' },
    { id: 'cf3', key: 'contact.defunto_ultimo', value: 'Mario Rossi' },
];

runScenario('primo defunto', [], 'Santo Sancono', {
    storico: ['Santo Sancono'],
    defunto: 'Santo Sancono',
    ultimo: 'Santo Sancono',
});

runScenario('secondo defunto — append', existingMario, 'Santo Sancono', {
    storico: ['Mario Rossi', 'Santo Sancono'],
    defunto: 'Mario Rossi',
    defunto2: 'Santo Sancono',
    ultimo: 'Santo Sancono',
});

runScenario('duplicato — non sovrascrive storico', existingMario, 'Mario Rossi', {
    alreadyRegistered: true,
    storico: ['Mario Rossi'],
    defunto: 'Mario Rossi',
    ultimo: 'Mario Rossi',
});

assert(
    readFuturiaCustomFieldValue(
        [{ key: 'contact.defunto_2', value: 'Anna Verdi' }],
        'contact.defunto_2'
    ) === 'Anna Verdi',
    'read custom field by key'
);

console.log('\nOK: tutti gli scenari append defunti superati.');
