/**
 * Ponte euro-per-euro: corrispettivi gateway → vendite CE.
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import prisma from '@/lib/prisma';
import { buildGatewayCorrispettivi } from '@/lib/financial/dossierCorrispettiviBuild';
import { resolveQuarterBounds, type TaxQuarter } from '@/lib/financial/taxQuarterly';
import { computeHistoricalPnl } from '@/lib/financial/historicalLedgerQuery';
import { applyFiscalAuthorityHierarchy } from '@/lib/financial/fiscalAuthorityDedupe';
import { isPrepaidSubscriptionPoseOrder } from '@/lib/financial/prepaidSubscriptionOrders';

function euro(c: number) {
    return (c / 100).toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
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

async function loadPoseRefs() {
    const poses = await prisma.order.findMany({
        where: {
            deletedAt: null,
            isTest: false,
            OR: [{ isRecurring: true }, { additionalInstructions: { contains: 'Duplicato da' } }],
        },
        select: {
            id: true,
            orderNumber: true,
            isRecurring: true,
            stripeTransactionId: true,
            grossAmount: true,
            netAmount: true,
            stripeFee: true,
            paymentMethodLabel: true,
            additionalInstructions: true,
            financeNotes: true,
        },
        take: 8000,
    });
    const orderIds = new Set<string>();
    const orderNumbers = new Set<string>();
    for (const o of poses) {
        if (!isPrepaidSubscriptionPoseOrder(o)) continue;
        orderIds.add(o.id);
        if (o.orderNumber) orderNumbers.add(o.orderNumber.toUpperCase());
    }
    return { orderIds, orderNumbers };
}

function isPoseRevenue(
    r: {
        sourceType: string;
        direction: string | null;
        orderId?: string | null;
        documentRef?: string | null;
        description?: string | null;
        totalCents: number;
    },
    refs: { orderIds: Set<string>; orderNumbers: Set<string> }
): boolean {
    if (r.direction === 'USCITA' || r.totalCents < 0) return false;
    if (r.sourceType === 'FLORIST_PAYOUT' || r.sourceType === 'BANK_LINE') return false;
    if (r.orderId && refs.orderIds.has(r.orderId)) {
        return r.sourceType === 'ORDER' || r.sourceType === 'JSON_ENTRY';
    }
    const doc = (r.documentRef || '').trim().toUpperCase();
    if (doc && refs.orderNumbers.has(doc)) {
        return r.sourceType === 'ORDER' || r.sourceType === 'JSON_ENTRY';
    }
    const desc = r.description || '';
    for (const num of refs.orderNumbers) {
        if (desc.includes(num)) {
            return r.sourceType === 'JSON_ENTRY' && /incasso ordine|ricavo ordine/i.test(desc);
        }
    }
    return false;
}

async function main() {
    const gw = await loadGateway2026();
    const gwSum = gw.reduce((s, g) => s + g.grossCents, 0);

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

    const { isFinanceSeedEntryId } = await import('@/lib/financial/formatFinanceDate');
    const cleaned = all.filter((r) => {
        if (r.sourceType === 'JSON_ENTRY' && isFinanceSeedEntryId(r.sourceId || '')) return false;
        if (r.sourceKey?.startsWith('JSON_ENTRY:entry_00')) return false;
        return true;
    });
    const poseRefs = await loadPoseRefs();
    const poseDropped = cleaned.filter((r) => isPoseRevenue(r, poseRefs));
    const withoutPose = cleaned.filter((r) => !isPoseRevenue(r, poseRefs));
    const hier = applyFiscalAuthorityHierarchy(withoutPose as never[]);

    const pnl = await computeHistoricalPnl({ fiscalYear: 2026 });
    const vendite = pnl.venditeCaratteristicheCents;

    const rawVendite = cleaned.filter(
        (r) => r.category === 'RICAVI_VENDITE' && (r.direction === 'ENTRATA' || r.totalCents > 0)
    );
    const hierVendite = hier.filter(
        (r) => r.category === 'RICAVI_VENDITE' && (r.direction === 'ENTRATA' || r.totalCents > 0)
    );
    // Soppressioni solo tra raw e hierarchy sullo stesso set (senza pose):
    const rawNoPose = withoutPose.filter(
        (r) => r.category === 'RICAVI_VENDITE' && (r.direction === 'ENTRATA' || r.totalCents > 0)
    );
    const suppressed = rawNoPose.filter((r) => !hierVendite.some((h) => h.id === r.id));

    const matchedIds = new Set<string>();
    const unmatched: typeof gw = [];
    for (const g of gw) {
        const hit = rawVendite.find((r) => {
            const blob = `${r.sourceKey || ''}|${r.description || ''}|${r.sourceId || ''}|${r.documentRef || ''}`;
            if (g.transactionId && blob.includes(g.transactionId)) return true;
            if (g.orderId && r.orderId === g.orderId && Math.abs(r.totalCents) === g.grossCents)
                return true;
            if (g.orderNumber && (r.description || '').includes(g.orderNumber)) return true;
            return false;
        });
        if (hit) matchedIds.add(hit.id);
        else unmatched.push(g);
    }
    const extraLedger = hierVendite.filter((r) => !matchedIds.has(r.id));

    const refundUscita = hier.filter(
        (r) => r.category === 'RIMBORSI' && (r.direction === 'USCITA' || r.totalCents < 0)
    );
    const seen = new Set<string>();
    const refundRows: Array<{ euro: string; key: string; desc: string }> = [];
    let refundAbs = 0;
    for (const r of refundUscita) {
        const k = `${Math.abs(r.totalCents)}:${r.accountingDate?.toISOString().slice(0, 10)}`;
        if (seen.has(k)) continue;
        seen.add(k);
        refundAbs += Math.abs(r.totalCents);
        refundRows.push({
            euro: euro(Math.abs(r.totalCents)),
            key: r.sourceKey || r.id,
            desc: (r.description || '').slice(0, 80),
        });
    }

    const poseVendite = poseDropped.filter(
        (r) => r.category === 'RICAVI_VENDITE' && (r.direction === 'ENTRATA' || r.totalCents > 0)
    );
    const poseSum = poseVendite.reduce((s, r) => s + Math.abs(r.totalCents), 0);
    const rawSum = rawVendite.reduce((s, r) => s + Math.abs(r.totalCents), 0);
    const hierSum = hierVendite.reduce((s, r) => s + Math.abs(r.totalCents), 0);
    const suppSum = suppressed.reduce((s, r) => s + Math.abs(r.totalCents), 0);
    // Path CE: raw − pose − supp − refunds ± other = vendite
    // hier already excludes pose, so: hier − refunds ± other = vendite
    const otherFilters = vendite - (hierSum - refundAbs);

    const arc = hier.filter((r) => r.category === 'AUTOFATTURE_REVERSE_CHARGE');
    const arcByEvent = new Map<string, number>();
    for (const r of arc) {
        const m = (r.sourceKey || '').match(/:(cmt[a-z0-9]+)/i);
        const eventKey = m?.[1] || (r.documentRef || '').trim() || r.sourceId || r.id;
        const v = Math.abs(r.vatCents || 0) || Math.abs(r.totalCents);
        const prev = arcByEvent.get(eventKey) || 0;
        if (v > prev) arcByEvent.set(eventKey, v);
    }
    const arcVat = [...arcByEvent.values()].reduce((s, v) => s + v, 0);
    const arcDeb = arcVat;
    const arcCred = arcVat;

    const unmatchedSum = unmatched.reduce((s, g) => s + g.grossCents, 0);
    const extraSum = extraLedger.reduce((s, r) => s + Math.abs(r.totalCents), 0);

    const steps = [
        { id: 'A', label: 'Registro corrispettivi (gateway)', cents: gwSum, why: 'fonte fiscale LIPE / F2' },
        {
            id: 'B',
            label: `− gateway senza match in RICAVI_VENDITE (${unmatched.length})`,
            cents: -unmatchedSum,
            why: 'assenza ledger o id charge/py ≠ txn',
        },
        {
            id: 'C',
            label: `+ RICAVI_VENDITE ledger oltre match gateway (${extraLedger.length})`,
            cents: extraSum,
            why: 'JSON/ORDER/manuali o match fallito lato gateway',
        },
        { id: 'D', label: 'Σ RICAVI_VENDITE grezzi', cents: rawSum, why: 'controllo A+B+C ≈ D' },
        {
            id: 'E',
            label: `− pose prepagate escluse dal CE (${poseVendite.length})`,
            cents: -poseSum,
            why: 'corretto: anticipo pose ≠ vendita periodo',
        },
        {
            id: 'F',
            label: `− doppi soppressi gerarchia (${suppressed.length})`,
            cents: -suppSum,
            why: 'corretto: stessa vendita già tenuta',
        },
        { id: 'G', label: 'Σ RICAVI post-gerarchia', cents: hierSum, why: 'base PnL prima rimborsi' },
        {
            id: 'H',
            label: `− rimborsi cliente USCITA (${refundRows.length})`,
            cents: -refundAbs,
            why: 'corretto: riduzione ricavo',
        },
        {
            id: 'I',
            label: '± altri filtri PnL',
            cents: otherFilters,
            why: otherFilters === 0 ? 'nessuno' : 'quarantena/seed residui',
        },
        { id: 'J', label: 'Vendite caratteristiche CE', cents: vendite, why: 'conto economico freeze' },
        {
            id: 'K',
            label: 'Gap gateway − CE',
            cents: gwSum - vendite,
            why: 'residuo aperto (non blocca LIPE)',
        },
    ];

    const md = `# Riconciliazione corrispettivi → CE — 21 settembre 2026

**Riferimento:** freeze \`2026-09-21-freeze-risultati.md\`.

## Domanda
Corrispettivi **€${euro(gwSum)}** vs CE pre-fix **€3.278,51** → gap storico **€1.098,65**.  
Dopo i fix: vendite CE **€${euro(vendite)}**, gap residuo **€${euro(gwSum - vendite)}**.

## Correzioni applicate
1. **PayPal HAYUM**: **€722,29** da \`TRASFERIMENTO_INTERNO\` → \`RICAVI_VENDITE\`.
2. **TD17** → \`AUTOFATTURE_REVERSE_CHARGE\`: **${arc.length}** righe / **${arcByEvent.size}** eventi; IVA debito = credito €${euro(arcVat)} (effetto CE nullo).

## Ponte euro-per-euro

| # | Step | Euro | Perché |
|---|------|-----:|--------|
${steps.map((s) => `| ${s.id} | ${s.label} | €${euro(s.cents)} | ${s.why} |`).join('\n')}

### E — Pose prepagate escluse
${
    poseVendite.length
        ? poseVendite
              .map((r) => `- €${euro(Math.abs(r.totalCents))} · \`${r.sourceKey}\``)
              .join('\n')
        : '_nessuna_'
}

### F — Doppi soppressi (corretti)
${
    suppressed.length
        ? suppressed
              .map(
                  (r) =>
                      `- €${euro(Math.abs(r.totalCents))} · \`${r.sourceKey}\` · ${(r.description || '').slice(0, 70)}`
              )
              .join('\n')
        : '_nessuno_'
}

### H — Rimborsi cliente
${
    refundRows.length
        ? refundRows.map((r) => `- €${r.euro} · \`${r.key}\` · ${r.desc}`).join('\n')
        : '_nessuno_'
}

### B — Gateway senza match ledger (${unmatched.length} / €${euro(unmatchedSum)})
${
    unmatched
        .map(
            (g) =>
                `- €${euro(g.grossCents)} · ${g.canaleIncasso} · \`${g.transactionId}\`${g.orderNumber ? ` · ${g.orderNumber}` : ''}`
        )
        .join('\n') || '_nessuno_'
}

### C — Ledger RICAVI senza match gateway (${extraLedger.length} / €${euro(extraSum)})
${
    extraLedger
        .map(
            (r) =>
                `- €${euro(Math.abs(r.totalCents))} · \`${r.sourceKey}\` · ${(r.description || '').slice(0, 60)}`
        )
        .join('\n') || '_nessuno_'
}

## Lettura del gap storico €1.098,65

| Voce | Euro | Stato |
|------|-----:|-------|
| Gap iniziale | €1.098,65 | — |
| PayPal riclassificati | €722,29 | **chiuso** |
| Residuo post-fix (K) | €${euro(gwSum - vendite)} | **aperto** — mismatch Stripe id + extra ledger; non blocca LIPE |

## TD17 / reverse charge
| | |
|--|--:|
| Righe ARC | ${arc.length} (${arcByEvent.size} eventi) |
| IVA a debito | €${euro(arcDeb)} |
| IVA a credito | €${euro(arcCred)} |
| Effetto su vendite CE | €0,00 |

## Numeri CE live
| Voce | Euro |
|------|-----:|
| Vendite caratteristiche | €${euro(vendite)} |
| Esercizio | €${euro(pnl.risultatoAnteImposteCents)} |
| Gestione | €${euro(pnl.risultatoAnteImposteCents - (pnl.contributiEsercizioCents || 0))} |
| IVA debito | €${euro(pnl.ivaDebitoCents)} |
| IVA credito | €${euro(pnl.ivaCreditoCents)} |
`;

    const base = join(process.cwd(), 'docs/verbali');
    writeFileSync(
        join(base, '2026-09-21-riconciliazione-corrispettivi-ce.json'),
        JSON.stringify(
            {
                at: new Date().toISOString(),
                steps,
                arc: { n: arc.length, debito: arcDeb, credito: arcCred },
                pnl: {
                    vendite,
                    esercizio: pnl.risultatoAnteImposteCents,
                    gestione: pnl.risultatoAnteImposteCents - (pnl.contributiEsercizioCents || 0),
                    ivaDebito: pnl.ivaDebitoCents,
                    ivaCredito: pnl.ivaCreditoCents,
                },
                unmatched,
                extraLedger: extraLedger.map((r) => ({
                    key: r.sourceKey,
                    cents: Math.abs(r.totalCents),
                })),
                suppressed: suppressed.map((r) => ({
                    key: r.sourceKey,
                    cents: Math.abs(r.totalCents),
                })),
                refunds: refundRows,
            },
            null,
            2
        )
    );
    writeFileSync(join(base, '2026-09-21-riconciliazione-corrispettivi-ce.md'), md);
    console.log(
        JSON.stringify(
            {
                gw: euro(gwSum),
                vendite: euro(vendite),
                gap: euro(gwSum - vendite),
                unmatched: unmatched.length,
                extra: extraLedger.length,
                pose: euro(poseSum),
                refunds: euro(refundAbs),
                other: euro(otherFilters),
                arc: { n: arc.length, d: euro(arcDeb), c: euro(arcCred) },
                esercizio: euro(pnl.risultatoAnteImposteCents),
                gestione: euro(pnl.risultatoAnteImposteCents - (pnl.contributiEsercizioCents || 0)),
                ivaD: euro(pnl.ivaDebitoCents),
                ivaC: euro(pnl.ivaCreditoCents),
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
