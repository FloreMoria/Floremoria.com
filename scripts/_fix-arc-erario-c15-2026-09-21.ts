/**
 * Fix Stripe TD17 31/05 + sync Erario c/IVA + verifica C15.
 */
import prisma from '@/lib/prisma';
import { syncErarioIvaYear } from '@/lib/financial/erarioIva';
import { controlC15 } from '@/lib/financial/dossierFiscalControls';
import { computeHistoricalPnl } from '@/lib/financial/historicalLedgerQuery';
import { calculateFinancialStatements } from '@/lib/financial/statements';
import type { TaxQuarter } from '@/lib/financial/taxQuarterly';

async function main() {
    // 1) Soft-delete JSON duplicate USCITA
    const jsonDup = await prisma.financialLedgerEntry.findFirst({
        where: {
            reversedAt: null,
            sourceKey: 'JSON_ENTRY:entry_autofattura_cmt2qaxdf0000kw04g78v1vof',
        },
        select: { id: true, totalCents: true, description: true },
    });
    if (jsonDup) {
        await prisma.financialLedgerEntry.update({
            where: { id: jsonDup.id },
            data: {
                reversedAt: new Date(),
                // reverseReason may not exist — use metadata
                metadataJson: {
                    reversedReason: 'TD17 Stripe 31/05 — copia JSON duplicata (fix 2026-09-21)',
                    reversedAt: new Date().toISOString(),
                },
            },
        });
        console.log('reversed JSON dup', jsonDup.id, jsonDup.totalCents);
    } else {
        console.log('JSON dup already absent');
    }

    // 2) Fix ENTRATA vatCents 69 → 0 (RC amount = |total| 314)
    const entrata = await prisma.financialLedgerEntry.findFirst({
        where: {
            reversedAt: null,
            sourceKey: 'MANUAL_EXPENSE:cmt2qaxdf0000kw04g78v1vof',
            direction: 'ENTRATA',
        },
        select: { id: true, vatCents: true, totalCents: true, netCents: true },
    });
    if (entrata && entrata.vatCents !== 0) {
        await prisma.financialLedgerEntry.update({
            where: { id: entrata.id },
            data: {
                vatCents: 0,
                netCents: entrata.totalCents,
                metadataJson: {
                    vatFix: 'RC: vatCents azzerato — importo reverse charge = |totalCents|',
                    previousVatCents: entrata.vatCents,
                    fixedAt: new Date().toISOString(),
                },
            },
        });
        console.log('fixed ENTRATA vat', entrata.id, entrata.vatCents, '→ 0');
    } else {
        console.log('ENTRATA vat already ok', entrata?.id);
    }

    // 3) Sync Erario writings T1–T3
    const erario = await syncErarioIvaYear(2026);
    console.log(
        'erario',
        erario.map((e) => ({
            q: e.quarter,
            d: e.debitoCorrispettiviCents,
            c: e.creditoFatturePassiveCents,
        }))
    );

    // 4) PnL must be unchanged on risultato (compare before/after Erario — Erario skipped)
    const pnl = await computeHistoricalPnl({ fiscalYear: 2026 });
    const stmts = await calculateFinancialStatements();

    // 5) C15
    const c15: Array<{ q: number; passed: boolean; detail: string }> = [];
    for (const q of [1, 2, 3] as TaxQuarter[]) {
        const r = await controlC15(2026, q);
        c15.push({ q, passed: r.passed, detail: r.detail });
    }

    console.log(
        JSON.stringify(
            {
                pnl: {
                    vendite: pnl.venditeCaratteristicheCents,
                    esercizio: pnl.risultatoAnteImposteCents,
                    gestione:
                        pnl.risultatoAnteImposteCents - (pnl.contributiEsercizioCents || 0),
                    ivaD: pnl.ivaDebitoCents,
                    ivaC: pnl.ivaCreditoCents,
                    arcWorkList: pnl.autofattureRcWorkList,
                },
                sp: stmts.statoPatrimoniale,
                c15,
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
