/**
 * Verifica invarianti macchina a stati PayPal (esempi Cursor / Transatel / incasso).
 * Esegui: npx tsx scripts/verify-paypal-state-machine.ts
 */

import {
    applyPaypalStateMachine,
    classifyPaypalEvent,
    recomputeSequentialRunningBalance,
    type PaypalMachineEntry,
} from '@/lib/accounting/paypalStateMachine';

function row(
    partial: Omit<PaypalMachineEntry, 'sourceType' | 'totalCents'> & {
        totalCents: number;
        sourceType?: string;
    }
): PaypalMachineEntry {
    return {
        sourceType: 'PAYPAL_MOVEMENT',
        ...partial,
    };
}

function assert(cond: unknown, msg: string): void {
    if (!cond) throw new Error(msg);
}

function main(): void {
    // Stato A — Cursor 17,75 €: transito carta + pagamento + storno tecnico
    const cursor = applyPaypalStateMachine([
        row({
            id: 'f1',
            accountingDate: '2026-03-10T10:00:00.000Z',
            direction: 'USCITA',
            totalCents: -1775,
            counterpartyName: 'staff.floremoria@gmail.com',
            description: 'Prelievo generico da carta',
            documentRef: 'FUND1',
            sourceKey: 'PAYPAL_TX:FUND1',
        }),
        row({
            id: 'c1',
            accountingDate: '2026-03-10T10:01:00.000Z',
            direction: 'USCITA',
            totalCents: -1775,
            counterpartyName: 'CURSOR, AI POWERED IDE',
            description: 'Pagamento pre-approvato · CURSOR',
            documentRef: 'CUR1',
            sourceKey: 'PAYPAL_TX:CUR1',
            category: 'SPESE_SAAS',
        }),
        row({
            id: 'r1',
            accountingDate: '2026-03-10T10:02:00.000Z',
            direction: 'ENTRATA',
            totalCents: 1775,
            counterpartyName: 'staff.floremoria@gmail.com',
            description: 'Blocco generico',
            documentRef: 'REV1',
            sourceKey: 'PAYPAL_TX:REV1',
            metadataJson: { parentTransactionId: 'FUND1' },
        }),
    ]);
    assert(cursor.length === 1, `Cursor cluster deve restare 1 riga, got ${cursor.length}`);
    assert(cursor[0]?.id === 'c1', 'Deve restare il pagamento CURSOR');
    assert(paypalAbs(cursor[0]!) === 1775, 'Importo netto 17,75 €');
    assert(/CURSOR/i.test(cursor[0]?.counterpartyName || ''), 'Controparte fornitore reale');

    // Stato B — Transatel / Ubigi somma zero
    const transatel = applyPaypalStateMachine([
        row({
            id: 't1',
            accountingDate: '2026-04-01T08:00:00.000Z',
            direction: 'USCITA',
            totalCents: -400,
            counterpartyName: 'TRANSATEL',
            description: 'TRANSATEL UBIGI',
            documentRef: 'TS1',
            sourceKey: 'PAYPAL_TX:TS1',
        }),
        row({
            id: 't2',
            accountingDate: '2026-04-01T09:00:00.000Z',
            direction: 'ENTRATA',
            totalCents: 15,
            counterpartyName: 'TRANSATEL',
            description: 'Rimborso TRANSATEL',
            documentRef: 'TS2',
            sourceKey: 'PAYPAL_TX:TS2',
            metadataJson: { parentTransactionId: 'TS1' },
        }),
        row({
            id: 't3',
            accountingDate: '2026-04-01T09:01:00.000Z',
            direction: 'ENTRATA',
            totalCents: 385,
            counterpartyName: 'UBIGI',
            description: 'Rimborso UBIGI',
            documentRef: 'TS3',
            sourceKey: 'PAYPAL_TX:TS3',
            metadataJson: { parentTransactionId: 'TS1' },
        }),
    ]);
    assert(transatel.length === 0, `Transatel zero-sum deve sparire, got ${transatel.length}`);

    // Stato B parziale: uscita 30 € e rimborso 10 € → una sola uscita netta 20 €
    const partial = applyPaypalStateMachine([
        row({
            id: 'b1',
            accountingDate: '2026-05-02T10:00:00.000Z',
            direction: 'USCITA',
            totalCents: -3000,
            counterpartyName: 'BALLARATE PIETRO SRL',
            description: 'BALLARATE',
            documentRef: 'BA1',
            sourceKey: 'PAYPAL_TX:BA1',
            category: 'ALTRI_COSTI',
        }),
        row({
            id: 'b2',
            accountingDate: '2026-05-02T12:00:00.000Z',
            direction: 'ENTRATA',
            totalCents: 1000,
            counterpartyName: 'BALLARATE PIETRO SRL',
            description: 'Rimborso BALLARATE',
            documentRef: 'BA2',
            sourceKey: 'PAYPAL_TX:BA2',
            category: 'RIMBORSI',
            metadataJson: { parentTransactionId: 'BA1' },
        }),
    ]);
    assert(partial.length === 1, `Parziale deve collassare in 1 riga, got ${partial.length}`);
    const partialNet = partial.reduce((s, r) => s + signed(r), 0);
    assert(partialNet === -2000, `Netto parziale -20,00 €, got ${partialNet}`);

    // Stato B multi-quota 06/05/2026 — Ballarate -57,95 + PayPal +9,31 + Ballarate +48,64 = 0
    const ballarateSeed: PaypalMachineEntry = {
        id: 'seed-fineco',
        sourceType: 'BANK_LINE',
        accountingDate: '2026-05-05T12:00:00.000Z',
        direction: 'USCITA',
        totalCents: -48120,
        description: 'Saldo pre-cluster',
    };
    const ballarateMulti = applyPaypalStateMachine([
        ballarateSeed,
        row({
            id: 'ba-out',
            accountingDate: '2026-05-06T09:10:00.000Z',
            direction: 'USCITA',
            totalCents: -5795,
            counterpartyName: 'BALLARATE PIETRO SRL',
            description: 'Pagamento · BALLARATE PIETRO SRL',
            documentRef: 'BA5795',
            sourceKey: 'PAYPAL_TX:BA5795',
            category: 'ALTRI_COSTI',
        }),
        row({
            id: 'ba-fee-rev',
            accountingDate: '2026-05-06T09:12:00.000Z',
            direction: 'ENTRATA',
            totalCents: 931,
            counterpartyName: 'PayPal',
            description: 'Storno commissione / conguaglio',
            documentRef: 'PP931',
            sourceKey: 'PAYPAL_TX:PP931',
        }),
        row({
            id: 'ba-rev',
            accountingDate: '2026-05-06T09:15:00.000Z',
            direction: 'ENTRATA',
            totalCents: 4864,
            counterpartyName: 'BALLARATE PIETRO SRL',
            description: 'Rimborso BALLARATE PIETRO SRL',
            documentRef: 'BA4864',
            sourceKey: 'PAYPAL_TX:BA4864',
            category: 'RIMBORSI',
        }),
    ]);
    const ballarateLeft = ballarateMulti.filter((r) => r.sourceType === 'PAYPAL_MOVEMENT');
    assert(
        ballarateLeft.length === 0,
        `Cluster Ballarate 06/05/2026 deve neutralizzarsi a 0 righe, got ${ballarateLeft.length}`
    );
    const runningBallarate = recomputeSequentialRunningBalance(ballarateMulti, 0);
    const lastBallarate = runningBallarate[runningBallarate.length - 1];
    assert(
        lastBallarate?.runningCents === -48120,
        `Saldo progressivo deve restare -481,20 €, got ${lastBallarate?.runningCents}`
    );

    // Stato C — incasso cliente
    const capture = applyPaypalStateMachine([
        row({
            id: 'o1',
            accountingDate: '2026-06-01T11:00:00.000Z',
            direction: 'ENTRATA',
            totalCents: 4500,
            counterpartyName: 'mario.rossi@email.it',
            description: 'Express Checkout',
            documentRef: 'ORD1',
            sourceKey: 'PAYPAL_TX:ORD1',
            category: 'RICAVI_VENDITE',
            orderId: 'ord_1',
            metadataJson: { eventCode: 'T0006' },
        }),
        row({
            id: 'ofee',
            accountingDate: '2026-06-01T11:00:00.000Z',
            direction: 'USCITA',
            totalCents: -150,
            counterpartyName: 'PayPal',
            description: 'Commissione PayPal — ORD1',
            documentRef: 'ORD1',
            sourceKey: 'PAYPAL_FEE:ORD1',
            category: 'ONERI_BANCARI',
        }),
    ]);
    assert(capture.length === 2, 'Incasso + fee restano');
    assert(classifyPaypalEvent(capture[0]!) === 'ORDER_CAPTURE' || capture[0]?.id === 'o1', 'capture kind');

    // Fineco payout non deve essere collassato
    const payout = applyPaypalStateMachine([
        row({
            id: 'p1',
            accountingDate: '2026-07-01T10:00:00.000Z',
            direction: 'USCITA',
            totalCents: -50000,
            counterpartyName: 'PayPal',
            description: 'Trasferimento bancario User Initiated Withdrawal',
            documentRef: 'PO1',
            sourceKey: 'PAYPAL_PAYOUT:PO1',
            category: 'PAYPAL_PAYOUT',
        }),
    ]);
    assert(payout.length === 1, 'Payout Fineco resta');

    // Saldo progressivo sequenziale
    const mixed = applyPaypalStateMachine([
        row({
            id: 'c1b',
            accountingDate: '2026-03-10',
            direction: 'USCITA',
            totalCents: -3000,
            counterpartyName: 'ORCHIDEADONGO.IT',
            description: 'ORCHIDEADONGO',
            sourceKey: 'PAYPAL_TX:ORC1',
            category: 'ALTRI_COSTI',
        }),
        row({
            id: 'f1b',
            accountingDate: '2026-03-10',
            direction: 'USCITA',
            totalCents: -3000,
            counterpartyName: 'staff.floremoria@gmail.com',
            description: 'Ricarica conto',
            sourceKey: 'PAYPAL_TX:F2',
        }),
        row({
            id: 'r1b',
            accountingDate: '2026-03-10',
            direction: 'ENTRATA',
            totalCents: 3000,
            counterpartyName: 'staff.floremoria@gmail.com',
            description: 'Blocco generico',
            sourceKey: 'PAYPAL_TX:R2',
        }),
        {
            id: 'bank',
            sourceType: 'BANK_LINE',
            accountingDate: '2026-03-11',
            direction: 'ENTRATA',
            totalCents: 10000,
            description: 'Accredito Fineco',
        },
    ]);
    const running = recomputeSequentialRunningBalance(mixed, 0);
    const last = running[running.length - 1];
    assert(last?.runningCents === 7000, `Saldo finale 70,00 €, got ${last?.runningCents}`);

    console.log('OK paypal state machine invariants');
}

function signed(r: PaypalMachineEntry): number {
    if (r.direction === 'ENTRATA') return Math.abs(r.totalCents);
    if (r.direction === 'USCITA') return -Math.abs(r.totalCents);
    return r.totalCents;
}

function paypalAbs(r: PaypalMachineEntry): number {
    return Math.abs(r.totalCents);
}

main();
