/**
 * V1 CONSULENZE + doppioni spese >€500 · V2 RAI riconciliazione · V3 PayPal→fioristi
 * Sola lettura.
 */
import prisma from '@/lib/prisma';
import { computeHistoricalPnl } from '@/lib/financial/historicalLedgerQuery';
import { applyFiscalAuthorityHierarchy } from '@/lib/financial/fiscalAuthorityDedupe';
import { namesCompatible } from '@/lib/financial/partnerNameMatch';

function euro(c: number) {
    return (c / 100).toFixed(2);
}

function originOf(sourceKey: string | null, sourceType: string | null): string {
    const k = sourceKey || '';
    if (k.startsWith('BANK_LINE_MANUAL:')) return 'bank_line_manual';
    if (k.startsWith('BANK_LINE:')) return 'bank_line';
    if (k.startsWith('MANUAL_EXPENSE:')) return 'manual_expense';
    if (sourceType === 'MANUAL_EXPENSE') return 'manual_expense';
    if (sourceType === 'BANK_LINE' || sourceType === 'BANK_LINE_MANUAL') return 'bank_line';
    return sourceType || 'unknown';
}

async function main() {
    // ─── V1: tutte le CONSULENZE 2026 ─────────────────────────────────
    const consulenze = await prisma.financialLedgerEntry.findMany({
        where: { reversedAt: null, fiscalYear: 2026, category: 'CONSULENZE' },
        orderBy: { accountingDate: 'asc' },
        select: {
            id: true,
            sourceKey: true,
            sourceType: true,
            sourceId: true,
            totalCents: true,
            accountingDate: true,
            description: true,
            direction: true,
            metadataJson: true,
        },
    });

    const expenseIds = consulenze
        .map((r) => {
            const m = (r.sourceKey || '').match(/^MANUAL_EXPENSE:(.+)$/);
            return m?.[1] || (r.sourceType === 'MANUAL_EXPENSE' ? r.sourceId : null);
        })
        .filter(Boolean) as string[];

    const expenses = expenseIds.length
        ? await prisma.manualFinanceExpense.findMany({
              where: { id: { in: expenseIds } },
              select: {
                  id: true,
                  vendorName: true,
                  totalCents: true,
                  matchedStatementLineId: true,
                  expenseDate: true,
                  description: true,
                  notes: true,
                  metadataJson: true,
                  docType: true,
              },
          })
        : [];
    const expById = new Map(expenses.map((e) => [e.id, e]));

    function invoiceRef(exp: (typeof expenses)[number] | null | undefined): string | null {
        if (!exp) return null;
        const meta =
            exp.metadataJson && typeof exp.metadataJson === 'object'
                ? (exp.metadataJson as Record<string, unknown>)
                : {};
        const fromMeta =
            (typeof meta.invoiceNumber === 'string' && meta.invoiceNumber) ||
            (typeof meta.numeroDocumento === 'string' && meta.numeroDocumento) ||
            (typeof meta.docNumber === 'string' && meta.docNumber) ||
            null;
        if (fromMeta) return fromMeta;
        const blob = `${exp.description || ''} ${exp.notes || ''}`;
        const m = blob.match(/\bn\.?\s*(\d+)\b/i) || blob.match(/fattura\s+n[°o.]?\s*(\d+)/i);
        return m?.[1] || null;
    }

    const bankIds = consulenze
        .map((r) => {
            const m = (r.sourceKey || '').match(/^BANK_LINE(?:_MANUAL)?:(.+)$/);
            return m?.[1] || null;
        })
        .filter(Boolean) as string[];
    const banks = bankIds.length
        ? await prisma.bankStatementLine.findMany({
              where: { id: { in: bankIds } },
              select: { id: true, amountCents: true, accountingDate: true, matchType: true },
          })
        : [];
    const bankById = new Map(banks.map((b) => [b.id, b]));

    console.log(
        '---V1_CONSULENZE---',
        JSON.stringify(
            {
                n: consulenze.length,
                sumAbsEuro: euro(consulenze.reduce((s, r) => s + Math.abs(r.totalCents), 0)),
                rows: consulenze.map((r) => {
                    const origin = originOf(r.sourceKey, r.sourceType);
                    const expId =
                        (r.sourceKey || '').match(/^MANUAL_EXPENSE:(.+)$/)?.[1] ||
                        (r.sourceType === 'MANUAL_EXPENSE' ? r.sourceId : null);
                    const bankId =
                        (r.sourceKey || '').match(/^BANK_LINE(?:_MANUAL)?:(.+)$/)?.[1] || null;
                    const exp = expId ? expById.get(expId) : null;
                    const bank = bankId ? bankById.get(bankId) : null;
                    return {
                        id: r.id,
                        date: (r.accountingDate || exp?.expenseDate || bank?.accountingDate)
                            ?.toISOString()
                            .slice(0, 10),
                        euro: euro(Math.abs(r.totalCents)),
                        origin,
                        sourceKey: r.sourceKey,
                        invoiceNumber: invoiceRef(exp),
                        vendorName: exp?.vendorName || null,
                        matchedBankLineId: exp?.matchedStatementLineId || null,
                        bankLineId: bankId,
                        desc: (r.description || '').slice(0, 140),
                    };
                }),
            },
            null,
            2
        )
    );

    // PnL: dopo dedupe, quante CONSULENZE restano?
    const pnlRows = await prisma.financialLedgerEntry.findMany({
        where: { reversedAt: null, fiscalYear: 2026, sourceType: { not: 'CUSTOMER_RECEIPT' } },
        select: {
            id: true,
            category: true,
            direction: true,
            totalCents: true,
            netCents: true,
            vatCents: true,
            sourceType: true,
            sourceId: true,
            sourceKey: true,
            orderId: true,
            documentRef: true,
            accountingDate: true,
            metadataJson: true,
            description: true,
            counterpartyName: true,
            bankLineId: true,
        },
    });
    const afterDedupe = applyFiscalAuthorityHierarchy(pnlRows as never[]);
    const consAfter = afterDedupe.filter((r) => r.category === 'CONSULENZE');
    console.log(
        '---V1_CONSULENZE_AFTER_DEDUPE---',
        JSON.stringify(
            {
                n: consAfter.length,
                sumEuro: euro(consAfter.reduce((s, r) => s + Math.abs(r.totalCents), 0)),
                rows: consAfter.map((r) => ({
                    sourceKey: r.sourceKey,
                    euro: euro(Math.abs(r.totalCents)),
                    origin: originOf(r.sourceKey, r.sourceType),
                })),
            },
            null,
            2
        )
    );

    // Doppioni spese > €500: stesso importo + stessa banca collegata, o bank+expense stesso abs
    const outflows = pnlRows.filter(
        (r) =>
            (r.direction === 'USCITA' || r.totalCents < 0) &&
            Math.abs(r.totalCents) >= 50000 &&
            !['TRASFERIMENTO_INTERNO', 'PAYPAL_PAYOUT', 'STRIPE_PAYOUT'].includes(r.category)
    );

    // Cluster by absolute amount + date window ±3d OR linked bank line
    type Row = (typeof outflows)[number];
    const byAmt = new Map<number, Row[]>();
    for (const r of outflows) {
        const a = Math.abs(r.totalCents);
        if (!byAmt.has(a)) byAmt.set(a, []);
        byAmt.get(a)!.push(r);
    }

    const duplicateCandidates: Array<{
        amountEuro: string;
        n: number;
        origins: string[];
        sourceKeys: string[];
        dates: string[];
        reason: string;
        keptByDedupe: string[];
        droppedByDedupe: string[];
    }> = [];

    const afterIds = new Set(afterDedupe.map((r) => r.id));

    for (const [amt, rows] of byAmt) {
        if (rows.length < 2) continue;
        // Check if both bank-ish and expense-ish present
        const origins = rows.map((r) => originOf(r.sourceKey, r.sourceType));
        const hasBank = origins.some((o) => o.startsWith('bank'));
        const hasExp = origins.some((o) => o === 'manual_expense');
        if (!hasBank || !hasExp) {
            // also flag same-origin pairs if same day
            const dates = rows.map((r) => r.accountingDate?.toISOString().slice(0, 10) || '?');
            const uniqueDays = new Set(dates);
            if (uniqueDays.size > 2) continue;
        }

        // Link via matchedStatementLineId
        const expRows = rows.filter((r) => originOf(r.sourceKey, r.sourceType) === 'manual_expense');
        const bankRows = rows.filter((r) => originOf(r.sourceKey, r.sourceType).startsWith('bank'));
        let linked = false;
        for (const er of expRows) {
            const eid = (er.sourceKey || '').replace(/^MANUAL_EXPENSE:/, '') || er.sourceId;
            if (!eid) continue;
            const exp = await prisma.manualFinanceExpense.findUnique({
                where: { id: eid },
                select: { matchedStatementLineId: true },
            });
            if (
                exp?.matchedStatementLineId &&
                bankRows.some((b) => (b.sourceKey || '').includes(exp.matchedStatementLineId!))
            ) {
                linked = true;
            }
        }
        if (!linked && !(hasBank && hasExp)) continue;

        const kept = rows.filter((r) => afterIds.has(r.id)).map((r) => r.sourceKey || r.id);
        const dropped = rows.filter((r) => !afterIds.has(r.id)).map((r) => r.sourceKey || r.id);

        duplicateCandidates.push({
            amountEuro: euro(amt),
            n: rows.length,
            origins,
            sourceKeys: rows.map((r) => r.sourceKey || r.id),
            dates: rows.map((r) => r.accountingDate?.toISOString().slice(0, 10) || '?'),
            reason: linked
                ? 'expense.matchedStatementLineId ↔ bank line'
                : 'stesso importo ≥€500 con bank+expense',
            keptByDedupe: kept,
            droppedByDedupe: dropped,
        });
    }

    console.log(
        '---V1_DUPLICATES_GT_500---',
        JSON.stringify(
            {
                candidatePairs: duplicateCandidates.length,
                totalAtRiskEuro: euro(
                    duplicateCandidates.reduce((s, d) => s + Math.round(parseFloat(d.amountEuro) * 100), 0)
                ),
                // solo quelli dove dedupe NON ha collassato → doppio in CE
                stillDoubleInPnl: duplicateCandidates.filter(
                    (d) => d.keptByDedupe.length >= 2
                ),
                collapsedByDedupe: duplicateCandidates.filter(
                    (d) => d.keptByDedupe.length === 1 && d.droppedByDedupe.length >= 1
                ),
                all: duplicateCandidates,
            },
            null,
            2
        )
    );

    // ─── V2 PnL ───────────────────────────────────────────────────────
    const pnl = await computeHistoricalPnl({ fiscalYear: 2026 });
    const contributi = pnl.contributiEsercizioCents || 0;
    const esercizio = pnl.risultatoAnteImposteCents;
    const gestione = esercizio - contributi;

    const FREEZE_GESTIONE = -845018;
    const FREEZE_ESERCIZIO = -385252;
    const FREEZE_CCIAA = 459766;

    console.log(
        '---V2_RAI---',
        JSON.stringify(
            {
                definitions: {
                    risultatoEsercizio: 'computeHistoricalPnl.risultatoAnteImposte (include CONTRIBUTI_ESERCIZIO)',
                    risultatoGestione: 'esercizio − contributi CCIAA',
                    contributoCCIAA: 'categoria CONTRIBUTI_ESERCIZIO',
                },
                freeze_11_09: {
                    gestioneEuro: euro(FREEZE_GESTIONE),
                    esercizioEuro: euro(FREEZE_ESERCIZIO),
                    cciaaEuro: euro(FREEZE_CCIAA),
                    check: FREEZE_ESERCIZIO === FREEZE_GESTIONE + FREEZE_CCIAA,
                },
                today: {
                    ricaviLordiEuro: euro(pnl.ricaviLordiCents),
                    venditeEuro: euro(pnl.venditeCaratteristicheCents),
                    altriRicaviEuro: euro(pnl.altriRicaviCents),
                    contributiEuro: euro(contributi),
                    costiFioristiEuro: euro(pnl.costiFioristiCents),
                    costiFatturePassiveEuro: euro(pnl.costiFatturePassiveSdiCents),
                    costiSaasEuro: euro(pnl.costiSaasCents),
                    costiOperativiEuro: euro(pnl.costiOperativiCents),
                    oneriBancariEuro: euro(pnl.oneriBancariCents),
                    ebitdaEuro: euro(pnl.ebitdaCents),
                    esercizioEuro: euro(esercizio),
                    gestioneEuro: euro(gestione),
                },
                deltaFromFreeze: {
                    deltaEsercizioEuro: euro(esercizio - FREEZE_ESERCIZIO),
                    deltaGestioneEuro: euro(gestione - FREEZE_GESTIONE),
                },
                reconciliationFromGestione8450: {
                    startGestione: euro(FREEZE_GESTIONE),
                    plusCciaaToEsercizio: {
                        label: '+ contributo CCIAA → risultato esercizio freeze',
                        euro: euro(FREEZE_CCIAA),
                        arrivesAt: euro(FREEZE_ESERCIZIO),
                    },
                    thenDeltaToTodayEsercizio: {
                        label: 'Δ esercizio freeze→oggi',
                        euro: euro(esercizio - FREEZE_ESERCIZIO),
                        arrivesAt: euro(esercizio),
                    },
                    todayGestione: {
                        label: 'oggi esercizio − CCIAA',
                        euro: euro(gestione),
                        formula: `${euro(esercizio)} − ${euro(contributi)}`,
                    },
                },
            },
            null,
            2
        )
    );

    // Break down delta: compare category totals conceptually
    // Load freeze snapshot if useful — otherwise list large CE movements after 2026-09-11
    const postFreeze = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            fiscalYear: 2026,
            accountingDate: { gte: new Date('2026-09-11') },
            OR: [{ direction: 'USCITA' }, { totalCents: { lt: 0 } }, { direction: 'ENTRATA' }, { totalCents: { gt: 0 } }],
        },
        select: {
            category: true,
            totalCents: true,
            direction: true,
            sourceKey: true,
            accountingDate: true,
            description: true,
        },
        take: 5000,
    });

    // Net CE impact of post-freeze rows (rough: exclude transfers)
    const transferCats = new Set(['TRASFERIMENTO_INTERNO', 'PAYPAL_PAYOUT', 'STRIPE_PAYOUT']);
    let postNet = 0;
    const byCatPost: Record<string, number> = {};
    for (const r of postFreeze) {
        if (transferCats.has(r.category)) continue;
        const signed =
            r.direction === 'ENTRATA' || r.totalCents > 0
                ? Math.abs(r.totalCents)
                : -Math.abs(r.totalCents);
        // contributi / ricavi positive, costi negative
        postNet += signed;
        byCatPost[r.category] = (byCatPost[r.category] || 0) + signed;
    }
    console.log(
        '---V2_POST_FREEZE_RAW---',
        JSON.stringify(
            {
                note: 'Somma grezza post-11/09 (pre-dedupe) — indicativa, non uguale al Δ PnL',
                postNetEuro: euro(postNet),
                byCategoryEuro: Object.fromEntries(
                    Object.entries(byCatPost)
                        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
                        .map(([k, v]) => [k, euro(v)])
                ),
            },
            null,
            2
        )
    );

    // ─── V3 PayPal → fioristi ─────────────────────────────────────────
    const partners = await prisma.partner.findMany({
        where: { deletedAt: null, partnerType: 'FLORIST' },
        select: { id: true, shopName: true, ownerName: true },
    });

    const paypalOut = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            fiscalYear: 2026,
            OR: [
                { sourceType: 'PAYPAL_MOVEMENT' },
                { sourceKey: { startsWith: 'PAYPAL_' } },
                { sourceKey: { startsWith: 'PAYPAL:' } },
            ],
            AND: [
                { OR: [{ direction: 'USCITA' }, { totalCents: { lt: 0 } }] },
            ],
        },
        select: {
            id: true,
            sourceKey: true,
            category: true,
            totalCents: true,
            description: true,
            counterpartyName: true,
            accountingDate: true,
        },
        take: 5000,
    });

    const floristPaypal = paypalOut.filter((r) => {
        if (r.category === 'COSTI_FIORISTI') return true;
        const blob = `${r.counterpartyName || ''} ${r.description || ''}`;
        return partners.some(
            (p) =>
                namesCompatible(p.shopName, blob) ||
                namesCompatible(p.ownerName || '', blob)
        );
    });

    // Also bank SDD paypal group A
    const sddLines = await prisma.bankStatementLine.findMany({
        where: {
            id: {
                in: [
                    'cmta7prjc0009lb041594qhxt',
                    'cmtq83vdw0004ld04k8vyufr5',
                    'cmtq83vdw0002ld04nxe008g3',
                ],
            },
        },
        select: {
            id: true,
            amountCents: true,
            matchType: true,
            matchNotes: true,
            description: true,
            accountingDate: true,
        },
    });

    console.log(
        '---V3_PAYPAL_FLORIST---',
        JSON.stringify(
            {
                paypalOutflowsTotal: {
                    n: paypalOut.length,
                    euro: euro(paypalOut.reduce((s, r) => s + Math.abs(r.totalCents), 0)),
                },
                paypalOutflowsToFlorists: {
                    n: floristPaypal.length,
                    euro: euro(floristPaypal.reduce((s, r) => s + Math.abs(r.totalCents), 0)),
                    sample: floristPaypal.slice(0, 20).map((r) => ({
                        date: r.accountingDate?.toISOString().slice(0, 10),
                        euro: euro(Math.abs(r.totalCents)),
                        category: r.category,
                        desc: (r.description || '').slice(0, 100),
                        sourceKey: r.sourceKey,
                    })),
                },
                groupA_sddStatus: sddLines.map((l) => ({
                    id: l.id,
                    date: l.accountingDate?.toISOString().slice(0, 10),
                    euro: euro(Math.abs(l.amountCents)),
                    matchType: l.matchType,
                    desc: l.description.slice(0, 100),
                })),
                recommendation:
                    floristPaypal.length === 0
                        ? 'Zero uscite PayPal→fioristi a sistema: lasciare i 3 SDD sospesi (non riclassificare ancora).'
                        : 'Esistono uscite PayPal→fioristi: gli SDD sono ricariche wallet; il costo sta nelle uscite PayPal.',
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
