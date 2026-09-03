#!/usr/bin/env npx tsx
/**
 * Verifica riconciliazione SDD Fineco ↔ PayPal: caso Aruba 27-29/04/2026.
 *
 * Aspettative:
 *   - 6 righe in input (3 PayPal + 3 Fineco SDD)
 *   - 3 righe in output (solo Fineco, con counterpartyName "Aruba S.p.A.")
 *   - Nessuna riga PAYPAL_MOVEMENT superstite per queste operazioni
 */

import { reconcileSddGatewayDuplicates } from '../lib/financial/paypalSddReconcile';
import type { FiscalDedupableEntry } from '../lib/financial/fiscalAuthorityDedupe';

const ARUBA_AMOUNTS_CENTS = [-609, -6100, -7319];

function makeRows(): FiscalDedupableEntry[] {
    // 3 righe PayPal (27/04/2026) — uscite verso Aruba
    const paypalRows: FiscalDedupableEntry[] = ARUBA_AMOUNTS_CENTS.map((cents, i) => ({
        id: `pp-aruba-${i}`,
        sourceType: 'PAYPAL_MOVEMENT',
        sourceKey: `PAYPAL_TX:aruba-${i}`,
        accountingDate: '2026-04-27',
        totalCents: cents,
        direction: 'USCITA',
        category: 'SPESE_SAAS',
        description: `Pagamento a Aruba S.p.A. dominio/hosting`,
        counterpartyName: 'Aruba S.p.A.',
    }));

    // 3 righe Fineco SDD (29/04/2026) — addebito "Paypal Europe S.a.r.l. Et Cie S.c.a Addebito Sdd Fattura"
    const finecoRows: FiscalDedupableEntry[] = ARUBA_AMOUNTS_CENTS.map((cents, i) => ({
        id: `fineco-sdd-${i}`,
        sourceType: 'BANK_LINE',
        sourceKey: `FINECO:sdd-pp-${i}`,
        accountingDate: '2026-04-29',
        totalCents: cents,
        direction: 'USCITA',
        category: 'TRASFERIMENTO_INTERNO',
        description: 'Paypal Europe S.a.r.l. Et Cie S.c.a Addebito Sdd Fattura',
        counterpartyName: 'Paypal Europe S.a.r.l.',
    }));

    // Aggiungi anche una riga non correlata per verificare che non venga toccata
    const unrelated: FiscalDedupableEntry = {
        id: 'other-expense',
        sourceType: 'BANK_LINE',
        sourceKey: 'FINECO:other',
        accountingDate: '2026-04-28',
        totalCents: -5000,
        direction: 'USCITA',
        category: 'SPESE_OPERATIVE',
        description: 'Bonifico a Mario Rossi',
        counterpartyName: 'Mario Rossi',
    };

    return [...paypalRows, ...finecoRows, unrelated];
}

function assert(condition: boolean, msg: string) {
    if (!condition) {
        console.error(`❌ FAIL: ${msg}`);
        process.exit(1);
    }
    console.log(`✅ PASS: ${msg}`);
}

// ---------- test ----------

const input = makeRows();
console.log(`\nInput: ${input.length} righe`);

const { rows, matches } = reconcileSddGatewayDuplicates(input);

console.log(`Output: ${rows.length} righe, ${matches.length} match\n`);

// 1. 3 match trovati
assert(matches.length === 3, `3 match SDD-PayPal (trovati ${matches.length})`);

// 2. 4 righe output (3 Fineco arricchite + 1 non correlata)
assert(rows.length === 4, `4 righe residue (trovate ${rows.length})`);

// 3. Nessuna riga PAYPAL_MOVEMENT superstite per Aruba
const survivingPaypal = rows.filter(
    (r) => r.sourceType === 'PAYPAL_MOVEMENT' && r.sourceKey?.includes('aruba'),
);
assert(survivingPaypal.length === 0, `0 righe PayPal Aruba superstiti (trovate ${survivingPaypal.length})`);

// 4. Le 3 Fineco ora hanno counterpartyName = "Aruba S.p.A." (non "Paypal Europe")
const finecoAruba = rows.filter(
    (r) => r.sourceType === 'BANK_LINE' && r.sourceKey?.startsWith('FINECO:sdd'),
);
assert(finecoAruba.length === 3, `3 righe Fineco SDD superstiti`);

for (const f of finecoAruba) {
    assert(
        f.counterpartyName === 'Aruba S.p.A.',
        `Fineco ${f.sourceKey}: counterparty="${f.counterpartyName}" (atteso "Aruba S.p.A.")`,
    );
    assert(
        !f.description?.includes('Paypal Europe S.a.r.l.'),
        `Fineco ${f.sourceKey}: description non contiene più "Paypal Europe S.a.r.l."`,
    );
    assert(
        f.description?.includes('Addebito Fineco via PayPal') === true,
        `Fineco ${f.sourceKey}: description contiene "Addebito Fineco via PayPal"`,
    );
}

// 5. Importi conservati
for (const amt of ARUBA_AMOUNTS_CENTS) {
    const found = finecoAruba.find((r) => r.totalCents === amt);
    assert(!!found, `Importo ${(amt / 100).toFixed(2)}€ presente nella riga Fineco`);
}

// 6. Riga non correlata intatta
const other = rows.find((r) => r.id === 'other-expense');
assert(!!other, 'Riga non correlata "other-expense" presente');
assert(other!.counterpartyName === 'Mario Rossi', 'Riga non correlata non modificata');

// 7. Match log: tutti i vendor reali sono "Aruba S.p.A."
for (const m of matches) {
    assert(m.realVendor === 'Aruba S.p.A.', `Match ${m.bankLineId}: vendor reale="${m.realVendor}"`);
    assert(m.gateway === 'paypal', `Match ${m.bankLineId}: gateway=paypal`);
}

console.log('\n🎉 Tutti i test di riconciliazione SDD-PayPal superati!');
