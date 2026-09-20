/**
 * Diagnosi MANCANTE IVA corrispettivi + gate 30% per trimestre.
 * Uso: npx tsx scripts/_diag-mancante-iva-quarters.ts
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env' });
loadEnv({ path: '.env.local' }); // non override

import { buildGatewayCorrispettivi } from '@/lib/financial/dossierCorrispettiviBuild';
import { resolveQuarterBounds, type TaxQuarter } from '@/lib/financial/taxQuarterly';
import { buildTaxQuarterlyReport } from '@/lib/financial/taxQuarterly';
import { buildTaxQuarterlyXlsxBuffer } from '@/lib/financial/taxQuarterlyXlsx';
import fs from 'node:fs';
import path from 'node:path';
import prisma from '@/lib/prisma';

async function measureQuarter(year: number, quarter: TaxQuarter) {
    const bounds = resolveQuarterBounds(year, quarter);
    const built = await buildGatewayCorrispettivi({ start: bounds.start, end: bounds.end });
    const mancante = built.rows.filter((r) => r.vatCertainty === 'MANCANTE');
    const pct = Math.round(built.totals.mancanteShare * 1000) / 10;
    return { bounds, built, mancante, pct, passGate: built.totals.mancanteShare <= 0.3 };
}

async function main() {
    const year = 2026;
    const outDir = path.join(process.cwd(), 'docs/verbali');
    const allRows: unknown[] = [];
    const summary: unknown[] = [];

    for (const q of [1, 2, 3] as TaxQuarter[]) {
        const m = await measureQuarter(year, q);
        summary.push({
            quarter: `T${q}`,
            label: m.bounds.label,
            mancanteSharePct: m.pct,
            passGate30: m.passGate,
            grossAllEuro: +(m.built.totals.grossAllCents / 100).toFixed(2),
            mancanteEuro: +(m.built.totals.mancanteGrossCents / 100).toFixed(2),
            determinataEuro: +(m.built.totals.determinataGrossCents / 100).toFixed(2),
            presuntaEuro: +(m.built.totals.presuntaGrossCents / 100).toFixed(2),
            mancanteRows: m.mancante.length,
        });

        for (const r of m.mancante) {
            const order = r.orderId
                ? await prisma.order.findUnique({
                      where: { id: r.orderId },
                      select: {
                          orderNumber: true,
                          items: {
                              select: {
                                  product: { select: { name: true, vatRatePercent: true } },
                              },
                          },
                      },
                  })
                : null;
            const productVat =
                order?.items.map((it) => ({
                    product: it.product?.name ?? null,
                    vatRatePercent: it.product?.vatRatePercent ?? null,
                })) ?? [];
            const why = r.orderId
                ? productVat.length === 0
                    ? 'Ordine collegato ma senza righe prodotto (items vuoti) → splitByProductVat fallisce'
                    : productVat.some((p) => p.vatRatePercent !== 10 && p.vatRatePercent !== 22)
                      ? 'Ordine collegato: almeno un prodotto senza vatRatePercent 10/22'
                      : 'Ordine collegato ma split aliquota non determinabile (altro)'
                : 'Incasso senza ordine collegato e senza regola PRESUNTA (.eu / dataset)';

            allRows.push({
                quarter: `T${q}`,
                date: r.date,
                canale: r.canaleIncasso,
                transactionId: r.transactionId,
                orderNumber: r.orderNumber || order?.orderNumber || null,
                orderId: r.orderId,
                grossEuro: +(Math.abs(r.grossCents) / 100).toFixed(2),
                vatRuleNote: r.vatRuleNote,
                why,
                productVat,
            });
        }

        console.log(
            `T${q}: MANCANTE ${m.pct}% · righe ${m.mancante.length} · gate30=${m.passGate ? 'PASS' : 'BLOCCA'}`
        );
    }

    const report = {
        generatedAt: new Date().toISOString(),
        definition:
            'MANCANTE = riga di registro corrispettivi (incasso gateway) per cui non è determinabile un’aliquota IVA 10% o 22% da Product.vatRatePercent sulle righe ordine, e non si applica la PRESUNZIONE §8.3 (.eu). Non misura l’aggancio ordine↔incasso: un incasso può essere agganciato e restare MANCANTE se i prodotti non hanno vatRatePercent.',
        formula: 'mancanteShare = Σ|gross| MANCANTE / Σ|gross| tutte le righe corrispettivi del periodo',
        gate: 'Export dossier bloccato se mancanteShare > 0.30',
        summary,
        mancanteRows: allRows,
    };

    const jsonPath = path.join(outDir, '17-09-2026-mancante-iva-elenco.json');
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n');
    console.log('Wrote', jsonPath, 'rows', allRows.length);

    // Prova export dossier dove passa il gate
    for (const q of [1, 2, 3] as TaxQuarter[]) {
        const s = summary.find((x: any) => x.quarter === `T${q}`) as any;
        if (!s?.passGate30) {
            console.log(`T${q}: skip export (gate BLOCCA)`);
            continue;
        }
        try {
            const reportQ = await buildTaxQuarterlyReport(year, q);
            const buf = await buildTaxQuarterlyXlsxBuffer(reportQ);
            const out = path.join(outDir, `Dossier_Fiscale_FloreMoria_2026_T${q}_oggi.xlsx`);
            fs.writeFileSync(out, buf);
            console.log(`T${q}: export OK → ${out} (${buf.length} bytes)`);
        } catch (e) {
            console.log(`T${q}: export FAIL`, e instanceof Error ? e.message : e);
        }
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
