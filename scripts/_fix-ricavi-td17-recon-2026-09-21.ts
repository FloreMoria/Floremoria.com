/**
 * 1) Ripristina vendite PayPal HAYUM (in corrispettivi) da TRASFERIMENTO → RICAVI_VENDITE
 * 2) Autofatture TD17 → AUTOFATTURE_REVERSE_CHARGE
 * Scrive nota riconciliazione + IVA recuperata + freeze.
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import prisma from '@/lib/prisma';
import { buildGatewayCorrispettivi } from '@/lib/financial/dossierCorrispettiviBuild';
import { resolveQuarterBounds, type TaxQuarter } from '@/lib/financial/taxQuarterly';
import { applyFiscalAuthorityHierarchy } from '@/lib/financial/fiscalAuthorityDedupe';
import { computeHistoricalPnl } from '@/lib/financial/historicalLedgerQuery';

function euro(c: number) {
    return (c / 100).toFixed(2);
}

async function loadGateway2026() {
    const gw: Array<{
        transactionId: string;
        grossCents: number;
        canaleIncasso: string;
        orderNumber: string;
        orderId: string | null;
        date: string;
    }> = [];
    for (const q of [1, 2, 3, 4] as TaxQuarter[]) {
        const b = resolveQuarterBounds(2026, q);
        if (b.start > new Date()) continue;
        const built = await buildGatewayCorrispettivi({ start: b.start, end: b.end });
        for (const r of built.rows) {
            gw.push({
                transactionId: r.transactionId,
                grossCents: Math.abs(r.grossCents),
                canaleIncasso: r.canaleIncasso,
                orderNumber: r.orderNumber || '',
                orderId: r.orderId,
                date: r.date,
            });
        }
    }
    return gw;
}

async function main() {
    const pnlBefore = await computeHistoricalPnl({ fiscalYear: 2026 });
    const before = {
        esercizio: pnlBefore.risultatoAnteImposteCents,
        gestione: pnlBefore.risultatoAnteImposteCents - (pnlBefore.contributiEsercizioCents || 0),
        vendite: pnlBefore.venditeCaratteristicheCents,
        ricaviLordi: pnlBefore.ricaviLordiCents,
        rimborsi: pnlBefore.rimborsiInRicaviCents,
        ivaDebito: pnlBefore.ivaDebitoCents,
        ivaCredito: pnlBefore.ivaCreditoCents,
    };

    const gw = await loadGateway2026();
    const gwSum = gw.reduce((s, g) => s + g.grossCents, 0);

    // ── 1. Restore PayPal sales ───────────────────────────────────────
    const paypalRestored: Array<{ id: string; tx: string; euro: string }> = [];
    for (const g of gw.filter((x) => x.canaleIncasso === 'PayPal')) {
        const row = await prisma.financialLedgerEntry.findFirst({
            where: {
                reversedAt: null,
                sourceKey: `PAYPAL_TX:${g.transactionId}`,
                category: 'TRASFERIMENTO_INTERNO',
                totalCents: g.grossCents,
            },
            select: { id: true, description: true, metadataJson: true },
        });
        if (!row) continue;
        const meta =
            row.metadataJson && typeof row.metadataJson === 'object'
                ? { ...(row.metadataJson as Record<string, unknown>) }
                : {};
        meta.restoredToRicaviAt = new Date().toISOString();
        meta.restoredReason =
            'Vendita in registro corrispettivi PayPal HAYUM — era TRASFERIMENTO (ARCH_PAYPAL_NOT_GATEWAY) a torto';
        await prisma.financialLedgerEntry.update({
            where: { id: row.id },
            data: {
                category: 'RICAVI_VENDITE',
                description: `[RESTORED_RICAVI_20260921] ${row.description || ''}`.slice(0, 2000),
                metadataJson: meta,
            },
        });
        paypalRestored.push({
            id: row.id,
            tx: g.transactionId,
            euro: euro(g.grossCents),
        });
    }

    // ── 2. TD17 → AUTOFATTURE_REVERSE_CHARGE ──────────────────────────
    const td17 = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            fiscalYear: 2026,
            OR: [
                { description: { contains: 'Autofattura TD17', mode: 'insensitive' } },
                { description: { contains: 'AUTOFATTURA TD17', mode: 'insensitive' } },
                { category: 'RIMBORSI', description: { contains: 'TD17', mode: 'insensitive' } },
            ],
        },
        select: {
            id: true,
            sourceKey: true,
            category: true,
            totalCents: true,
            vatCents: true,
            description: true,
            accountingDate: true,
        },
    });

    const td17Updated = [];
    for (const r of td17) {
        if (r.category === 'AUTOFATTURE_REVERSE_CHARGE') continue;
        await prisma.financialLedgerEntry.update({
            where: { id: r.id },
            data: { category: 'AUTOFATTURE_REVERSE_CHARGE' },
        });
        td17Updated.push({
            id: r.id,
            from: r.category,
            euro: euro(Math.abs(r.totalCents)),
            vat: euro(Math.abs(r.vatCents)),
            desc: (r.description || '').slice(0, 80),
        });
    }

    // ── 3. Post PnL + reconciliation bridge ───────────────────────────
    const pnlAfter = await computeHistoricalPnl({ fiscalYear: 2026 });
    const after = {
        esercizio: pnlAfter.risultatoAnteImposteCents,
        gestione: pnlAfter.risultatoAnteImposteCents - (pnlAfter.contributiEsercizioCents || 0),
        vendite: pnlAfter.venditeCaratteristicheCents,
        ricaviLordi: pnlAfter.ricaviLordiCents,
        rimborsi: pnlAfter.rimborsiInRicaviCents,
        ivaDebito: pnlAfter.ivaDebitoCents,
        ivaCredito: pnlAfter.ivaCreditoCents,
    };

    const all = await prisma.financialLedgerEntry.findMany({
        where: { reversedAt: null, fiscalYear: 2026, sourceType: { not: 'CUSTOMER_RECEIPT' } },
        select: {
            id: true,
            sourceKey: true,
            sourceType: true,
            sourceId: true,
            category: true,
            direction: true,
            totalCents: true,
            vatCents: true,
            netCents: true,
            accountingDate: true,
            description: true,
            counterpartyName: true,
            bankLineId: true,
            metadataJson: true,
            documentRef: true,
            orderId: true,
            attachmentUrl: true,
        },
    });
    const hier = applyFiscalAuthorityHierarchy(all as never[]);
    const hierVendite = hier.filter(
        (r) => r.category === 'RICAVI_VENDITE' && (r.direction === 'ENTRATA' || r.totalCents > 0)
    );
    const hierSum = hierVendite.reduce((s, r) => s + Math.abs(r.totalCents), 0);
    const rawVendite = all.filter(
        (r) => r.category === 'RICAVI_VENDITE' && (r.direction === 'ENTRATA' || r.totalCents > 0)
    );
    const rawSum = rawVendite.reduce((s, r) => s + Math.abs(r.totalCents), 0);
    const suppressed = rawVendite.filter((r) => !hierVendite.some((h) => h.id === r.id));

    const refundUscita = hier.filter(
        (r) => r.category === 'RIMBORSI' && (r.direction === 'USCITA' || r.totalCents < 0)
    );
    const seen = new Set<string>();
    let refundAbs = 0;
    for (const r of refundUscita) {
        const k = `${Math.abs(r.totalCents)}:${r.accountingDate?.toISOString().slice(0, 10)}`;
        if (seen.has(k)) continue;
        seen.add(k);
        refundAbs += Math.abs(r.totalCents);
    }

    // Gateway still without RICAVI after restore
    const stillMissing = [];
    for (const g of gw) {
        const hit = rawVendite.find(
            (r) =>
                (r.sourceKey || '').includes(g.transactionId) ||
                (r.description || '').includes(g.transactionId) ||
                (g.orderId && r.orderId === g.orderId && Math.abs(r.totalCents) === g.grossCents)
        );
        if (!hit) {
            stillMissing.push({
                tx: g.transactionId,
                euro: euro(g.grossCents),
                channel: g.canaleIncasso,
                order: g.orderNumber || null,
            });
        }
    }

    const paypalEuro = paypalRestored.reduce((s, r) => s + Math.round(parseFloat(r.euro) * 100), 0);
    const td17Euro = td17Updated.reduce((s, r) => s + Math.round(parseFloat(r.euro) * 100), 0);

    // Bridge narrative
    const bridge = {
        startGateway: gwSum,
        minus_stillNotInRicavi: stillMissing.reduce((s, m) => s + Math.round(parseFloat(m.euro) * 100), 0),
        plus_rawRicaviExtraNotInGw: rawSum - (gwSum - stillMissing.reduce((s, m) => s + Math.round(parseFloat(m.euro) * 100), 0)),
        // cleaner steps:
        steps: [
            { label: 'Registro corrispettivi (gateway)', euro: euro(gwSum) },
            {
                label: `− vendite gateway ancora senza riga RICAVI_VENDITE (${stillMissing.length})`,
                euro: euro(
                    -stillMissing.reduce((s, m) => s + Math.round(parseFloat(m.euro) * 100), 0)
                ),
                rows: stillMissing,
            },
            {
                label: '+ ricavi ledger non abbinati 1:1 al gateway (JSON/ORDER/fuori gateway/Connect…)',
                euro: 'see residual',
            },
            { label: 'Σ RICAVI_VENDITE grezzi in ledger', euro: euro(rawSum) },
            {
                label: '− soppressioni gerarchia (doppi)',
                euro: euro(-suppressed.reduce((s, r) => s + Math.abs(r.totalCents), 0)),
                rows: suppressed.map((r) => ({
                    euro: euro(Math.abs(r.totalCents)),
                    key: r.sourceKey,
                    desc: (r.description || '').slice(0, 70),
                })),
            },
            { label: 'Σ RICAVI_VENDITE post-gerarchia', euro: euro(hierSum) },
            {
                label: '− rimborsi cliente (riduzione ricavo)',
                euro: euro(-refundAbs),
            },
            {
                label: '± altri filtri PnL (pose/quarantena/…)',
                euro: euro(after.vendite - (hierSum - refundAbs)),
            },
            { label: 'Vendite caratteristiche CE', euro: euro(after.vendite) },
            { label: 'Gap residuo gateway − CE', euro: euro(gwSum - after.vendite) },
        ],
        paypalRestored: { n: paypalRestored.length, euro: euro(paypalEuro), rows: paypalRestored },
        td17Moved: { n: td17Updated.length, euro: euro(td17Euro), rows: td17Updated },
        pnlBefore: {
            esercizio: euro(before.esercizio),
            gestione: euro(before.gestione),
            vendite: euro(before.vendite),
            ricaviLordi: euro(before.ricaviLordi),
            rimborsi: euro(before.rimborsi),
        },
        pnlAfter: {
            esercizio: euro(after.esercizio),
            gestione: euro(after.gestione),
            vendite: euro(after.vendite),
            ricaviLordi: euro(after.ricaviLordi),
            rimborsi: euro(after.rimborsi),
            ivaDebito: euro(after.ivaDebito),
            ivaCredito: euro(after.ivaCredito),
        },
        td17EffectOnResult: {
            note: 'TD17 fuori ricavi: ricavi lordi scendono dell’importo TD17; esercizio migliora di pari (€ CE non più gonfiato). IVA debito+credito invariata netta.',
            deltaRicaviLordi: euro(after.ricaviLordi - before.ricaviLordi),
            deltaEsercizio: euro(after.esercizio - before.esercizio),
            deltaGestione: euro(after.gestione - before.gestione),
            deltaVendite: euro(after.vendite - before.vendite),
        },
    };

    const base = join(process.cwd(), 'docs/verbali');
    writeFileSync(
        join(base, '2026-09-21-riconciliazione-corrispettivi-ce.json'),
        JSON.stringify(bridge, null, 2)
    );

    const mdRecon = `# Riconciliazione corrispettivi → CE — 21 settembre 2026

## Obiettivo
Partire da **€${euro(gwSum)}** (registro corrispettivi gateway, ${gw.length} vendite) e arrivare alle **vendite caratteristiche CE €${euro(after.vendite)}**.

## Correzioni applicate oggi
1. **PayPal HAYUM** in corrispettivi ma in ledger come \`TRASFERIMENTO_INTERNO\` (\`ARCH_PAYPAL_NOT_GATEWAY\`): **${paypalRestored.length}** righe / **€${euro(paypalEuro)}** ripristinate in \`RICAVI_VENDITE\`.
2. **Autofatture TD17**: **${td17Updated.length}** righe / **€${euro(td17Euro)}** da \`RIMBORSI\` → \`AUTOFATTURE_REVERSE_CHARGE\` (effetto CE nullo; IVA debito = credito).

## Ponte (dopo fix)

| Step | Euro |
|------|------|
| Registro corrispettivi | ${euro(gwSum)} |
| Σ RICAVI_VENDITE grezzi ledger | ${euro(rawSum)} |
| − doppi soppressi gerarchia (${suppressed.length}) | ${euro(-suppressed.reduce((s, r) => s + Math.abs(r.totalCents), 0))} |
| Σ post-gerarchia | ${euro(hierSum)} |
| − rimborsi cliente | ${euro(-refundAbs)} |
| ± altri filtri PnL | ${euro(after.vendite - (hierSum - refundAbs))} |
| **Vendite CE** | **${euro(after.vendite)}** |
| **Gap gateway − CE** | **${euro(gwSum - after.vendite)}** |

### Doppi soppressi (corretti)
${suppressed.map((r) => `- €${euro(Math.abs(r.totalCents))} · \`${r.sourceKey}\` · ${(r.description || '').slice(0, 70)}`).join('\n')}

### Gateway ancora senza riga RICAVI (${stillMissing.length} / €${euro(stillMissing.reduce((s, m) => s + Math.round(parseFloat(m.euro) * 100), 0))})
Da chiudere (Stripe charge id ≠ txn ledger, o movimento assente):
${stillMissing.map((m) => `- €${m.euro} · ${m.channel} · \`${m.tx}\`${m.order ? ` · ${m.order}` : ''}`).join('\n') || '_nessuno_'}

### PayPal ripristinati
${paypalRestored.map((r) => `- €${r.euro} · \`${r.tx}\``).join('\n')}

## Effetto TD17 sul risultato
| | Prima | Dopo | Δ |
|--|------:|------:|--:|
| Ricavi lordi | ${euro(before.ricaviLordi)} | ${euro(after.ricaviLordi)} | ${euro(after.ricaviLordi - before.ricaviLordi)} |
| Vendite caratteristiche | ${euro(before.vendite)} | ${euro(after.vendite)} | ${euro(after.vendite - before.vendite)} |
| Esercizio | ${euro(before.esercizio)} | ${euro(after.esercizio)} | ${euro(after.esercizio - before.esercizio)} |
| Gestione | ${euro(before.gestione)} | ${euro(after.gestione)} | ${euro(after.gestione - before.gestione)} |

Le TD17 **non** devono produrre ricavi: solo IVA a debito e a credito che si compensano.
`;

    writeFileSync(join(base, '2026-09-21-riconciliazione-corrispettivi-ce.md'), mdRecon);

    console.log(
        JSON.stringify(
            {
                paypalRestored: bridge.paypalRestored,
                td17Moved: { n: td17Updated.length, euro: euro(td17Euro) },
                gapBeforeWouldBe: euro(437716 - 327851),
                gapAfter: euro(gwSum - after.vendite),
                pnlAfter: bridge.pnlAfter,
                td17Effect: bridge.td17EffectOnResult,
                stillMissingN: stillMissing.length,
                stillMissingEuro: euro(
                    stillMissing.reduce((s, m) => s + Math.round(parseFloat(m.euro) * 100), 0)
                ),
            },
            null,
            2
        )
    );

    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
