/**
 * Fase 5 — misura impatto layer dedupe (sola lettura / what-if).
 * Uso: npx tsx scripts/fase5-dedupe-measure.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();
if (process.env.DATABASE_URL_UNPOOLED) {
    process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
}

import prisma from '../lib/prisma';
import { computeHistoricalPnl } from '../lib/financial/historicalLedgerQuery';
import { compareGatewayTransitBalances } from '../lib/financial/gatewayTransitBalance';
import { applyFiscalAuthorityHierarchy } from '../lib/financial/fiscalAuthorityDedupe';
import { applyFinecoMasterLedger } from '../lib/accounting/finecoMasterLedger';
import { applyPaypalStateMachine } from '../lib/financial/paypalStateMachine';
import { reconcileSddGatewayDuplicates } from '../lib/financial/paypalSddReconcile';
import { isPrepaidSubscriptionPoseOrder, loadPrepaidPoseRefSets, isPrepaidPoseRevenueEntry } from '../lib/financial/prepaidSubscriptionOrders';
import { isFinanceSeedEntryId } from '../lib/financial/formatFinanceDate';

function euro(cents: number) {
    return (cents / 100).toLocaleString('it-IT', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
    });
}

async function loadRaw2026() {
    const rows = await prisma.financialLedgerEntry.findMany({
        where: { reversedAt: null, fiscalYear: 2026, sourceType: { not: 'CUSTOMER_RECEIPT' } },
        select: {
            id: true,
            sourceType: true,
            sourceId: true,
            sourceKey: true,
            orderId: true,
            documentRef: true,
            accountingDate: true,
            totalCents: true,
            direction: true,
            category: true,
            bankLineId: true,
            description: true,
            counterpartyName: true,
            attachmentUrl: true,
            metadataJson: true,
            netCents: true,
            vatCents: true,
        },
    });
    const cleaned = rows.filter((r) => {
        if (r.sourceType === 'JSON_ENTRY' && isFinanceSeedEntryId(r.sourceId || '')) return false;
        if (r.sourceKey?.startsWith('JSON_ENTRY:entry_00')) return false;
        return true;
    });
    const poseRefs = await loadPrepaidPoseRefSets();
    return cleaned.filter((r) => !isPrepaidPoseRevenueEntry(r as any, poseRefs));
}

/** Replica CE aggregato su un set di righe già filtrato (senza ri-applicare hierarchy). */
function pnlFromRows(rows: Awaited<ReturnType<typeof loadRaw2026>>) {
    let ricavi = 0;
    let costiFioristi = 0;
    let costiPassive = 0;
    let costiSaas = 0;
    let costiOp = 0;
    let oneri = 0;

    const isTransfer = (c: string) =>
        c === 'TRASFERIMENTO_INTERNO' || c === 'PAYPAL_PAYOUT' || c === 'STRIPE_PAYOUT';

    for (const r of rows) {
        if (isTransfer(r.category)) continue;
        if (r.direction === 'ENTRATA' || r.totalCents > 0) {
            if (
                ['RICAVI_VENDITE', 'ALTRI_RICAVI', 'CONTRIBUTI_ESERCIZIO', 'RIMBORSI'].includes(
                    r.category
                )
            ) {
                ricavi += Math.abs(r.totalCents);
            }
        } else {
            const abs = Math.abs(r.totalCents);
            if (r.category === 'COSTI_FIORISTI' || r.sourceType === 'FLORIST_PAYOUT') costiFioristi += abs;
            else if (r.category === 'SPESE_SAAS' || r.sourceType === 'SAAS_INVOICE') costiSaas += abs;
            else if (r.category === 'ONERI_BANCARI') oneri += abs;
            else if (r.sourceType === 'MANUAL_EXPENSE') costiPassive += abs;
            else costiOp += abs;
        }
    }
    const costi = costiFioristi + costiPassive + costiSaas + costiOp + oneri;
    const rai = ricavi - costi;
    return { ricavi, costi, rai, n: rows.length };
}

async function snapOfficial() {
    const p = await computeHistoricalPnl({ fiscalYear: 2026 });
    const t = await compareGatewayTransitBalances();
    const costi =
        p.costiFioristiCents +
        p.costiFatturePassiveSdiCents +
        p.costiSaasCents +
        p.costiOperativiCents +
        p.oneriBancariCents;
    const raw = await loadRaw2026();
    const hier = applyFiscalAuthorityHierarchy(raw);
    const { rows: master } = applyFinecoMasterLedger(hier, raw);
    return {
        rai: p.risultatoAnteImposteCents,
        ricavi: p.ricaviLordiCents,
        costi,
        banca: p.cashBankBalanceCents,
        stripe: t.stripe.transitLedgerCents,
        paypal: t.paypal.transitLedgerCents,
        primaNota: master.length,
        hierN: hier.length,
        rawN: raw.length,
    };
}

async function main() {
    const baseline = await snapOfficial();
    const raw = await loadRaw2026();

    // A: no fiscalAuthorityHierarchy (identity) — still Fineco master on raw for PN count
    const aPnl = pnlFromRows(raw);
    const { rows: aMaster } = applyFinecoMasterLedger(raw, raw);

    // Partial: only paypal+sdd (steps inside hierarchy before authority)
    const step0 = applyPaypalStateMachine(raw);
    const step0b = reconcileSddGatewayDuplicates(step0).rows;
    const aPartialPnl = pnlFromRows(step0b);

    // B: hierarchy ON, but simulate visual dedupe off = hier count (visual only affects display map)
    // Visual dedupe doesn't affect RAI — only Prima Nota display count after map.
    // Approximate: hier length vs after a trivial visual key count
    const hier = applyFiscalAuthorityHierarchy(raw);
    const { rows: master } = applyFinecoMasterLedger(hier, raw);

    // C: hierarchy ON, Fineco master OFF (identity) → PN = hier length
    // D: visual dedupe is in primaNotaShared — doesn't change CE

    const out = {
        baseline: {
            ...baseline,
            euro: {
                rai: euro(baseline.rai),
                ricavi: euro(baseline.ricavi),
                costi: euro(baseline.costi),
                banca: euro(baseline.banca),
                stripe: euro(baseline.stripe),
                paypal: euro(baseline.paypal),
            },
        },
        passoA_noHierarchy: {
            rai: aPnl.rai,
            ricavi: aPnl.ricavi,
            costi: aPnl.costi,
            primaNotaApprox: aMaster.length,
            deltaRai: aPnl.rai - baseline.rai,
            deltaRicavi: aPnl.ricavi - baseline.ricavi,
            deltaCosti: aPnl.costi - baseline.costi,
            euro: {
                rai: euro(aPnl.rai),
                ricavi: euro(aPnl.ricavi),
                costi: euro(aPnl.costi),
                deltaRai: euro(aPnl.rai - baseline.rai),
                deltaRicavi: euro(aPnl.ricavi - baseline.ricavi),
                deltaCosti: euro(aPnl.costi - baseline.costi),
            },
            moves: aPnl.rai !== baseline.rai || aPnl.ricavi !== baseline.ricavi || aPnl.costi !== baseline.costi,
        },
        passoA_onlyPaypalSdd: {
            rai: aPartialPnl.rai,
            ricavi: aPartialPnl.ricavi,
            costi: aPartialPnl.costi,
            deltaRai: aPartialPnl.rai - baseline.rai,
            euro: {
                rai: euro(aPartialPnl.rai),
                deltaRai: euro(aPartialPnl.rai - baseline.rai),
            },
            moves:
                aPartialPnl.rai !== baseline.rai ||
                aPartialPnl.ricavi !== baseline.ricavi ||
                aPartialPnl.costi !== baseline.costi,
        },
        passoC_noFinecoMaster: {
            primaNotaWouldBe: hier.length,
            deltaPrimaNota: hier.length - master.length,
            note: 'Fineco master non tocca CE; solo conteggio Prima Nota / listati',
        },
        passoB_visualDedupe: {
            note: 'dedupePrimaNotaVisualEntries opera su DisplayEntry post-map; non tocca computeHistoricalPnl',
            hierN: hier.length,
            masterN: master.length,
        },
    };

    console.log(JSON.stringify(out, null, 2));
}

main()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
