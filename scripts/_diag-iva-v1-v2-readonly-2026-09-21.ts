/**
 * READ-ONLY — V1 TD17 debito/credito per autofattura · V2 IVA debito corrispettivi vs CE.
 * Nessuna scrittura DB.
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

async function loadGatewayByQuarter() {
    const byQ: Record<number, { sales: number; iva: number; n: number }> = {
        1: { sales: 0, iva: 0, n: 0 },
        2: { sales: 0, iva: 0, n: 0 },
        3: { sales: 0, iva: 0, n: 0 },
        4: { sales: 0, iva: 0, n: 0 },
    };
    const rows: Array<{
        q: number;
        tx: string;
        gross: number;
        iva: number;
        channel: string;
        order: string;
    }> = [];
    for (const q of [1, 2, 3, 4] as TaxQuarter[]) {
        const b = resolveQuarterBounds(2026, q);
        if (b.start > new Date()) continue;
        const built = await buildGatewayCorrispettivi({ start: b.start, end: b.end });
        for (const r of built.rows) {
            byQ[q].sales += Math.abs(r.grossCents);
            byQ[q].iva += Math.abs(r.ivaCents);
            byQ[q].n += 1;
            rows.push({
                q,
                tx: r.transactionId,
                gross: Math.abs(r.grossCents),
                iva: Math.abs(r.ivaCents),
                channel: r.canaleIncasso,
                order: r.orderNumber || '',
            });
        }
    }
    return { byQ, rows };
}

function eventKey(r: {
    sourceKey: string | null;
    sourceId: string | null;
    documentRef: string | null;
    id: string;
}): string {
    const m = (r.sourceKey || '').match(/:(cmt[a-z0-9]+)/i);
    if (m?.[1]) return m[1];
    const doc = (r.documentRef || '').trim();
    if (doc && doc !== 'TD17') return doc;
    return r.sourceId || r.id;
}

async function main() {
    // ── V1: TD17 pairs ───────────────────────────────────────────────
    const arcAll = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            fiscalYear: 2026,
            category: 'AUTOFATTURE_REVERSE_CHARGE',
        },
        select: {
            id: true,
            sourceKey: true,
            sourceType: true,
            sourceId: true,
            direction: true,
            totalCents: true,
            vatCents: true,
            netCents: true,
            accountingDate: true,
            description: true,
            documentRef: true,
            counterpartyName: true,
            metadataJson: true,
        },
        orderBy: { accountingDate: 'asc' },
    });

    type Side = {
        key: string;
        dir: string;
        total: number;
        vat: number;
        vatUsed: number;
        sourceKey: string;
        desc: string;
        date: string;
    };
    const groups = new Map<
        string,
        { ent: Side[]; usc: Side[]; vendor: string; date: string }
    >();

    for (const r of arcAll) {
        const ek = eventKey(r);
        if (!groups.has(ek)) {
            groups.set(ek, {
                ent: [],
                usc: [],
                vendor: r.counterpartyName || '',
                date: r.accountingDate?.toISOString().slice(0, 10) || '',
            });
        }
        const g = groups.get(ek)!;
        const isEnt = r.direction === 'ENTRATA' || r.totalCents > 0;
        const vatUsed = Math.abs(r.vatCents || 0) || Math.abs(r.totalCents);
        const side: Side = {
            key: ek,
            dir: isEnt ? 'ENTRATA' : 'USCITA',
            total: Math.abs(r.totalCents),
            vat: Math.abs(r.vatCents || 0),
            vatUsed,
            sourceKey: r.sourceKey || r.id,
            desc: (r.description || '').slice(0, 90),
            date: r.accountingDate?.toISOString().slice(0, 10) || '',
        };
        if (isEnt) g.ent.push(side);
        else g.usc.push(side);
        if (!g.vendor && r.counterpartyName) g.vendor = r.counterpartyName;
        if (!g.date && side.date) g.date = side.date;
        // extract vendor from description
        const vm = (r.description || '').match(/Autofattura TD17[^—]*—\s*([^(]+)/i);
        if (vm && !g.vendor) g.vendor = vm[1].trim();
    }

    const v1Rows = [...groups.entries()].map(([ek, g]) => {
        const debito = g.ent.reduce((s, x) => s + x.vatUsed, 0);
        // Prefer max single-side to avoid double counting duplicate ENTRATA rows
        const debitoMax = g.ent.length
            ? Math.max(...g.ent.map((x) => x.vatUsed))
            : 0;
        const creditoMax = g.usc.length
            ? Math.max(...g.usc.map((x) => x.vatUsed))
            : 0;
        const creditoSum = g.usc.reduce((s, x) => s + x.vatUsed, 0);
        return {
            eventKey: ek,
            vendor: g.vendor || g.ent[0]?.desc || g.usc[0]?.desc || '',
            date: g.date,
            nEntrata: g.ent.length,
            nUscita: g.usc.length,
            ivaDebitoCents: debitoMax,
            ivaCreditoCents: creditoMax,
            saldoCents: debitoMax - creditoMax,
            hasDebito: g.ent.length > 0,
            hasCredito: g.usc.length > 0,
            entKeys: g.ent.map((x) => x.sourceKey),
            uscKeys: g.usc.map((x) => x.sourceKey),
            note:
                g.ent.length === 0
                    ? 'MANCA DEBITO'
                    : g.usc.length === 0
                      ? 'MANCA CREDITO'
                      : debitoMax === creditoMax
                        ? 'OK bilanciato'
                        : `SQUILIBRIO Δ€${euro(debitoMax - creditoMax)}`,
            // raw for audit
            debitoSumAllEntrata: debito,
            creditoSumAllUscita: creditoSum,
        };
    });

    v1Rows.sort((a, b) => a.date.localeCompare(b.date) || a.eventKey.localeCompare(b.eventKey));

    const v1Summary = {
        nEvents: v1Rows.length,
        nOk: v1Rows.filter((r) => r.note === 'OK bilanciato').length,
        nMancaDebito: v1Rows.filter((r) => !r.hasDebito).length,
        nMancaCredito: v1Rows.filter((r) => !r.hasCredito).length,
        nSquilibrio: v1Rows.filter((r) => r.hasDebito && r.hasCredito && r.saldoCents !== 0)
            .length,
        sumDebito: v1Rows.reduce((s, r) => s + r.ivaDebitoCents, 0),
        sumCredito: v1Rows.reduce((s, r) => s + r.ivaCreditoCents, 0),
        rawLedgerRows: arcAll.length,
    };

    // ── V2: corrispettivi IVA vs CE ───────────────────────────────────
    const gw = await loadGatewayByQuarter();
    const gwIvaTotal = Object.values(gw.byQ).reduce((s, q) => s + q.iva, 0);

    const pnl = await computeHistoricalPnl({ fiscalYear: 2026 });

    // Decompose CE IVA debito
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

    // Same pose filter as PnL
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
    const poseIds = new Set<string>();
    const poseNums = new Set<string>();
    for (const o of poses) {
        if (!isPrepaidSubscriptionPoseOrder(o)) continue;
        poseIds.add(o.id);
        if (o.orderNumber) poseNums.add(o.orderNumber.toUpperCase());
    }
    const withoutPose = cleaned.filter((r) => {
        if (r.direction === 'USCITA' || r.totalCents < 0) return true;
        if (r.sourceType === 'FLORIST_PAYOUT' || r.sourceType === 'BANK_LINE') return true;
        if (r.orderId && poseIds.has(r.orderId) && (r.sourceType === 'ORDER' || r.sourceType === 'JSON_ENTRY'))
            return false;
        return true;
    });
    const hier = applyFiscalAuthorityHierarchy(withoutPose as never[]);

    // CE IVA debito components (mirroring historicalLedgerQuery logic)
    const arcByEvent = new Map<string, number>();
    for (const r of hier) {
        if (r.category !== 'AUTOFATTURE_REVERSE_CHARGE') continue;
        const ek = eventKey(r);
        const v = Math.abs(r.vatCents || 0) || Math.abs(r.totalCents);
        if (v > (arcByEvent.get(ek) || 0)) arcByEvent.set(ek, v);
    }
    const arcIva = [...arcByEvent.values()].reduce((s, v) => s + v, 0);

    let ivaFromRicavi = 0;
    let ivaFromAltri = 0;
    let ivaFromContributi = 0;
    let ivaFromRimborsiEntrata = 0;
    let ivaRefundReduction = 0;
    const ricaviVatRows: Array<{ key: string; total: number; vat: number; cat: string }> = [];
    const refundVatRows: Array<{ key: string; total: number; vat: number }> = [];

    for (const r of hier) {
        if (r.category === 'AUTOFATTURE_REVERSE_CHARGE') continue;
        if (r.category === 'RIMBORSI' && (r.direction === 'USCITA' || r.totalCents < 0)) {
            if (r.vatCents !== 0) {
                ivaRefundReduction += Math.abs(r.vatCents);
                refundVatRows.push({
                    key: r.sourceKey || r.id,
                    total: Math.abs(r.totalCents),
                    vat: Math.abs(r.vatCents),
                });
            }
            continue;
        }
        if (!(r.direction === 'ENTRATA' || r.totalCents > 0)) continue;
        if (
            r.category !== 'RICAVI_VENDITE' &&
            r.category !== 'ALTRI_RICAVI' &&
            r.category !== 'CONTRIBUTI_ESERCIZIO' &&
            r.category !== 'RIMBORSI'
        )
            continue;
        const v = Math.abs(r.vatCents);
        if (r.category === 'RICAVI_VENDITE') {
            ivaFromRicavi += v;
            if (v > 0)
                ricaviVatRows.push({
                    key: r.sourceKey || r.id,
                    total: Math.abs(r.totalCents),
                    vat: v,
                    cat: r.category,
                });
        } else if (r.category === 'ALTRI_RICAVI') ivaFromAltri += v;
        else if (r.category === 'CONTRIBUTI_ESERCIZIO') ivaFromContributi += v;
        else if (r.category === 'RIMBORSI') ivaFromRimborsiEntrata += v;
    }

    // Expected IVA on CE vendite at 10% of gross (scorporo) for comparison
    const venditeGross = pnl.venditeCaratteristicheCents;
    // scorporo 10%: iva = gross * 10/110
    const expectedIvaOnCeVendite = Math.round((venditeGross * 10) / 110);

    const ceIvaDebito = pnl.ivaDebitoCents;
    const diff = gwIvaTotal - ceIvaDebito;

    // Rows in gateway with vat vs ledger RICAVI with vat=0
    let gwMatchedVat0 = 0;
    let gwMatchedVatOk = 0;
    let gwUnmatched = 0;
    const zeroVatMatched: Array<{ tx: string; gross: number; gwIva: number; ledgerKey: string }> =
        [];
    for (const g of gw.rows) {
        const hit = hier.find((r) => {
            if (r.category !== 'RICAVI_VENDITE') return false;
            const blob = `${r.sourceKey || ''}|${r.description || ''}|${r.sourceId || ''}`;
            return blob.includes(g.tx);
        });
        if (!hit) {
            gwUnmatched += 1;
            continue;
        }
        if (Math.abs(hit.vatCents) === 0) {
            gwMatchedVat0 += 1;
            zeroVatMatched.push({
                tx: g.tx,
                gross: g.gross,
                gwIva: g.iva,
                ledgerKey: hit.sourceKey || hit.id,
            });
        } else gwMatchedVatOk += 1;
    }

    const v2 = {
        corrispettivi: {
            byQuarter: Object.fromEntries(
                Object.entries(gw.byQ).map(([q, v]) => [
                    q,
                    { n: v.n, sales: euro(v.sales), iva: euro(v.iva), ivaCents: v.iva },
                ])
            ),
            totalIvaCents: gwIvaTotal,
            totalIvaEuro: euro(gwIvaTotal),
            source: 'buildGatewayCorrispettivi — scorporo 10% su ogni vendita (LIPE / dichiarazione)',
        },
        contoEconomico: {
            ivaDebitoCents: ceIvaDebito,
            ivaDebitoEuro: euro(ceIvaDebito),
            decomposition: {
                arcReverseCharge: { cents: arcIva, euro: euro(arcIva) },
                ricaviVenditeVatField: { cents: ivaFromRicavi, euro: euro(ivaFromRicavi) },
                altriRicavi: { cents: ivaFromAltri, euro: euro(ivaFromAltri) },
                contributi: { cents: ivaFromContributi, euro: euro(ivaFromContributi) },
                rimborsiEntrata: { cents: ivaFromRimborsiEntrata, euro: euro(ivaFromRimborsiEntrata) },
                menoRimborsiUscitaVat: {
                    cents: -ivaRefundReduction,
                    euro: euro(-ivaRefundReduction),
                },
                sumCheck: euro(
                    arcIva +
                        ivaFromRicavi +
                        ivaFromAltri +
                        ivaFromContributi +
                        ivaFromRimborsiEntrata -
                        ivaRefundReduction
                ),
            },
            source: 'computeHistoricalPnl — somma vatCents ledger (non scorporo corrispettivi)',
            venditeCeEuro: euro(venditeGross),
            expectedIvaIfScorporo10OnCeVendite: euro(expectedIvaOnCeVendite),
        },
        gap: {
            cents: diff,
            euro: euro(diff),
            formula: 'corrispettivi IVA − CE IVA debito',
        },
        matchingInsight: {
            gwRows: gw.rows.length,
            matchedLedgerVatOk: gwMatchedVatOk,
            matchedLedgerVat0: gwMatchedVat0,
            unmatched: gwUnmatched,
            zeroVatMatchedSample: zeroVatMatched.slice(0, 15),
            zeroVatMatchedIvaLostCents: zeroVatMatched.reduce((s, r) => s + r.gwIva, 0),
            note: 'Molte righe RICAVI_VENDITE hanno vatCents=0 mentre il registro scorpora il 10% → CE sottostima IVA debito vendite',
        },
        refundVatRows,
        ricaviWithVatN: ricaviVatRows.length,
        ricaviWithVatSum: euro(ivaFromRicavi),
    };

    const md = `# Diagnosi IVA V1/V2 — sola lettura — 21 settembre 2026

**Nessuna correzione applicata.**

## V1 — Autofatture TD17: debito vs credito per evento

Eventi distinti: **${v1Summary.nEvents}** (righe ledger ARC grezze: ${v1Summary.rawLedgerRows}).

| Esito | n |
|-------|--:|
| OK bilanciato | ${v1Summary.nOk} |
| Manca debito | ${v1Summary.nMancaDebito} |
| Manca credito | ${v1Summary.nMancaCredito} |
| Squilibrio importi | ${v1Summary.nSquilibrio} |
| Σ IVA debito (max per evento) | €${euro(v1Summary.sumDebito)} |
| Σ IVA credito (max per evento) | €${euro(v1Summary.sumCredito)} |
| Saldo Σ | €${euro(v1Summary.sumDebito - v1Summary.sumCredito)} |

### Tabella riga per riga

| Data | Fornitore / evento | IVA debito | IVA credito | Saldo | Esito |
|------|--------------------|----------:|------------:|------:|-------|
${v1Rows
    .map(
        (r) =>
            `| ${r.date} | ${(r.vendor || r.eventKey).slice(0, 50).replace(/\|/g, '/')} | €${euro(r.ivaDebitoCents)} | €${euro(r.ivaCreditoCents)} | €${euro(r.saldoCents)} | ${r.note} |`
    )
    .join('\n')}

### Lettura
- Il PnL oggi prende **una sola volta** per evento l'importo e lo mette su **entrambi** i lati (€${euro(arcIva)}).
- Se a livello documento manca la registrazione a debito (o a credito), quel credito **non è detraibile** finché non esiste la coppia reverse charge.
- Righe duplicate ENTRATA/USCITA sullo stesso evento: in tabella usiamo il **max** per lato (evita doppio conteggio).

## V2 — Due IVA a debito

| Fonte | IVA a debito | Ruolo |
|-------|-------------:|-------|
| **Registro corrispettivi** (gateway, 10% scorporo) | **€${euro(gwIvaTotal)}** | **Dichiarazione / LIPE** |
| di cui T1 | €${euro(gw.byQ[1].iva)} | |
| di cui T2 | €${euro(gw.byQ[2].iva)} | |
| di cui T3 | €${euro(gw.byQ[3].iva)} | |
| **Conto economico** (ledger \`vatCents\`) | **€${euro(ceIvaDebito)}** | Gestione / PnL |
| **Differenza** | **€${euro(diff)}** | |

### Scomposizione CE €${euro(ceIvaDebito)}
| Componente | Euro |
|------------|-----:|
| Autofatture TD17 (ARC, stesso importo su debito e credito) | €${euro(arcIva)} |
| IVA da campo \`vatCents\` su RICAVI_VENDITE | €${euro(ivaFromRicavi)} |
| Altri ricavi / contributi / rimborsi ENTRATA | €${euro(ivaFromAltri + ivaFromContributi + ivaFromRimborsiEntrata)} |
| − IVA su rimborsi USCITA | €${euro(-ivaRefundReduction)} |
| **Totale CE** | **€${euro(ceIvaDebito)}** |

### Perché divergono
1. **Fonti diverse:** corrispettivi = scorporo 10% sul lordo gateway; CE = somma \`vatCents\` delle righe ledger.
2. **Molte vendite in ledger hanno \`vatCents = 0\`** anche se sono in corrispettivi: match con vat=0 = **${gwMatchedVat0}** righe (IVA “persa” lato CE ≈ €${euro(zeroVatMatched.reduce((s, r) => s + r.gwIva, 0))}); gateway senza match ledger = **${gwUnmatched}**.
3. **Il CE include l’IVA ARC TD17 (€${euro(arcIva)})** che **non** è nel registro corrispettivi (è reverse charge, altro meccanismo).
4. **Rimborsi / note:** ${refundVatRows.length} rettifiche IVA su rimborsi USCITA (€${euro(ivaRefundReduction)}).

### Fonte per la dichiarazione
**Solo il registro corrispettivi (€${euro(gwIvaTotal)}).** Il CE non è fonte di liquidazione IVA a debito sulle vendite.

Identità di controllo attesa (post-correzione futura):  
\`IVA debito CE (solo vendite, senza ARC) = IVA debito corrispettivi (± rettifiche documentate)\`.
`;

    const out = {
        at: new Date().toISOString(),
        readOnly: true,
        v1: { summary: v1Summary, rows: v1Rows },
        v2,
        pnlLive: {
            ivaDebito: euro(pnl.ivaDebitoCents),
            ivaCredito: euro(pnl.ivaCreditoCents),
            vendite: euro(pnl.venditeCaratteristicheCents),
        },
    };

    const base = join(process.cwd(), 'docs/verbali');
    writeFileSync(join(base, '2026-09-21-diag-iva-v1-v2-readonly.json'), JSON.stringify(out, null, 2));
    writeFileSync(join(base, '2026-09-21-diag-iva-v1-v2-readonly.md'), md);
    console.log(
        JSON.stringify(
            {
                v1: {
                    events: v1Summary.nEvents,
                    ok: v1Summary.nOk,
                    mancaDebito: v1Summary.nMancaDebito,
                    mancaCredito: v1Summary.nMancaCredito,
                    squilibrio: v1Summary.nSquilibrio,
                    sumD: euro(v1Summary.sumDebito),
                    sumC: euro(v1Summary.sumCredito),
                },
                v2: {
                    corr: euro(gwIvaTotal),
                    ce: euro(ceIvaDebito),
                    gap: euro(diff),
                    arc: euro(arcIva),
                    ricaviVat: euro(ivaFromRicavi),
                    vat0matched: gwMatchedVat0,
                    unmatched: gwUnmatched,
                    lostIvaVat0: euro(zeroVatMatched.reduce((s, r) => s + r.gwIva, 0)),
                },
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
