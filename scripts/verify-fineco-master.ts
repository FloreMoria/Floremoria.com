#!/usr/bin/env npx tsx
/**
 * Verifica vista Prima Nota Fineco-mastro:
 * 1. Caso Aruba SDD: 3 Fineco + 3 PayPal → 3 righe Fineco con fornitore reale
 * 2. Payout: 1 Fineco credit + 1 PayPal payout → 1 riga Fineco con drill-down
 * 3. Giroconto / ORDER / JSON esclusi dall'elenco principale
 * 4. Saldo progressivo = somma solo BANK_LINE
 */

import { applyFinecoMasterLedger } from '../lib/accounting/finecoMasterLedger';
import { reconcileSddGatewayDuplicates } from '../lib/financial/paypalSddReconcile';
import type { FiscalDedupableEntry } from '../lib/financial/fiscalAuthorityDedupe';

function assert(condition: boolean, msg: string) {
    if (!condition) {
        console.error(`❌ FAIL: ${msg}`);
        process.exit(1);
    }
    console.log(`✅ PASS: ${msg}`);
}

const ARUBA = [-609, -6100, -7319];

function arubaFixture(): FiscalDedupableEntry[] {
    const paypal = ARUBA.map((cents, i) => ({
        id: `pp-${i}`,
        sourceType: 'PAYPAL_MOVEMENT',
        sourceKey: `PAYPAL_TX:aruba-${i}`,
        accountingDate: '2026-04-27',
        totalCents: cents,
        direction: 'USCITA',
        category: 'SPESE_SAAS',
        description: 'Aruba S.p.A. hosting',
        counterpartyName: 'Aruba S.p.A.',
    }));
    const fineco = ARUBA.map((cents, i) => ({
        id: `fc-${i}`,
        sourceType: 'BANK_LINE',
        sourceKey: `BANK_LINE:sdd-${i}`,
        accountingDate: '2026-04-29',
        totalCents: cents,
        direction: 'USCITA',
        category: 'TRASFERIMENTO_INTERNO',
        description: 'Paypal Europe S.a.r.l. Et Cie S.c.a Addebito Sdd Fattura',
        counterpartyName: 'Paypal Europe S.a.r.l.',
    }));
    return [...paypal, ...fineco];
}

function payoutFixture(): FiscalDedupableEntry[] {
    return [
        {
            id: 'pp-payout',
            sourceType: 'PAYPAL_MOVEMENT',
            sourceKey: 'PAYPAL_PAYOUT:xyz',
            accountingDate: '2026-05-01',
            totalCents: 15000,
            direction: 'ENTRATA',
            category: 'PAYPAL_PAYOUT',
            description: 'Trasferimento di denaro',
            counterpartyName: 'PayPal',
            metadataJson: { movementKind: 'payout', payoutId: 'xyz' },
        },
        {
            id: 'fc-payout',
            sourceType: 'BANK_LINE',
            sourceKey: 'BANK_LINE:payout-1',
            accountingDate: '2026-05-02',
            totalCents: 15000,
            direction: 'ENTRATA',
            category: 'TRASFERIMENTO_INTERNO',
            description: 'Bonifico SEPA PAYPAL EUROPE S.A.R.L.',
            counterpartyName: 'PayPal Europe',
        },
        {
            id: 'order-1',
            sourceType: 'ORDER',
            sourceKey: 'ORDER:abc',
            accountingDate: '2026-04-28',
            totalCents: 15500,
            direction: 'ENTRATA',
            category: 'RICAVI_VENDITE',
            description: 'Ordine web',
        },
        {
            id: 'giro-fictitious',
            sourceType: 'PAYPAL_MOVEMENT',
            sourceKey: 'PAYPAL_TX:sweep',
            accountingDate: '2026-05-01',
            totalCents: 100,
            direction: 'ENTRATA',
            category: 'TRASFERIMENTO_INTERNO',
            description: 'Auto-sweep interno',
            counterpartyName: 'PayPal',
        },
    ];
}

console.log('\n=== Aruba SDD Fineco-mastro ===');
{
    const input = arubaFixture();
    const sdd = reconcileSddGatewayDuplicates(input);
    const { rows } = applyFinecoMasterLedger(sdd.rows, input);
    assert(rows.length === 3, `3 sole righe Fineco (trovate ${rows.length})`);
    assert(
        rows.every((r) => r.sourceType === 'BANK_LINE'),
        'Tutte le righe sono BANK_LINE',
    );
    assert(
        rows.every((r) => r.counterpartyName === 'Aruba S.p.A.'),
        'Beneficiario = Aruba S.p.A.',
    );
    assert(
        !rows.some((r) => r.sourceType === 'PAYPAL_MOVEMENT'),
        'Nessuna riga PayPal autonoma',
    );
    const saldo = rows.reduce((s, r) => s + r.totalCents, 0);
    assert(saldo === ARUBA.reduce((a, b) => a + b, 0), `Saldo = somma Aruba (${saldo})`);
}

console.log('\n=== Payout + giroconto ===');
{
    const input = payoutFixture();
    const { rows } = applyFinecoMasterLedger(input, input);
    assert(rows.length === 1, `1 sola riga Fineco payout (trovate ${rows.length})`);
    assert(rows[0].id === 'fc-payout', 'Riga superstite = accredito Fineco');
    const meta = rows[0].metadataJson as Record<string, unknown>;
    assert(!!meta?.finecoGatewayDrillDown, 'Drill-down gateway presente');
    const dd = meta.finecoGatewayDrillDown as { kind: string; netCents: number };
    assert(dd.kind === 'payout_credit', `kind=payout_credit (got ${dd.kind})`);
    assert(dd.netCents === 15000, 'Netto Fineco = 150,00 €');
}

console.log('\n🎉 Vista Fineco-mastro verificata!');
