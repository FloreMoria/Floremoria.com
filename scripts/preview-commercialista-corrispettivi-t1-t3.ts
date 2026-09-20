/**
 * Rigenera T1/T2/T3 2026 commercialista corrispettivi e confronta con totali precedenti.
 * Uso: npx tsx scripts/preview-commercialista-corrispettivi-t1-t3.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
    buildCommercialistaCorrispettiviXlsxOrdered,
    type CommercialistaCorrispettiviPreview,
} from '@/lib/financial/commercialistaCorrispettiviXlsx';
import type { TaxQuarter } from '@/lib/financial/taxQuarterly';

function euro(cents: number): string {
    return `€ ${(cents / 100).toFixed(2)}`;
}

/** Snapshot precedente (preview T2 pre-aliquota unica + stime T1/T3 da dossier con MANCANTE). */
const PREVIOUS: Record<
    string,
    {
        salesCount: number | null;
        imponibileCents: number | null;
        ivaDebitoCents: number | null;
        lordoCents: number | null;
        f3TotalCents: number | null;
        note: string;
    }
> = {
    T1: {
        salesCount: null,
        imponibileCents: null,
        ivaDebitoCents: null,
        lordoCents: null,
        f3TotalCents: null,
        note: 'nessun preview commercialista T1 precedente in verbali',
    },
    T2: {
        salesCount: 27,
        imponibileCents: 82624,
        ivaDebitoCents: 8745,
        lordoCents: 124602,
        f3TotalCents: null,
        note: 'preview pre-FASE1 (9 MANCANTE €332,33 esclusi da imponibile/IVA)',
    },
    T3: {
        salesCount: null,
        imponibileCents: null,
        ivaDebitoCents: null,
        lordoCents: null,
        f3TotalCents: null,
        note: 'nessun preview commercialista T3 precedente in verbali',
    },
};

function delta(
    label: string,
    prev: number | null,
    next: number
): { label: string; prev: string; next: string; delta: string } {
    return {
        label,
        prev: prev == null ? 'n/d' : euro(prev),
        next: euro(next),
        delta: prev == null ? 'n/d' : euro(next - prev),
    };
}

async function runQuarter(quarter: TaxQuarter): Promise<{
    preview: CommercialistaCorrispettiviPreview;
    outPath: string;
}> {
    const period = { kind: 'quarter' as const, year: 2026, quarter };
    console.error(`[preview] Generazione 2026 T${quarter}…`);
    const { buffer, preview } = await buildCommercialistaCorrispettiviXlsxOrdered(period);
    const outDir = path.join(process.cwd(), 'docs', 'verbali');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, preview.filename);
    fs.writeFileSync(outPath, buffer);
    console.error(`[preview] OK T${quarter} → ${outPath} (${buffer.length} bytes)`);
    return { preview, outPath };
}

async function main() {
    const quarters: TaxQuarter[] = [1, 2, 3];
    const results: unknown[] = [];

    for (const q of quarters) {
        const { preview, outPath } = await runQuarter(q);
        const key = `T${q}`;
        const prev = PREVIOUS[key];
        const row = {
            trimestre: key,
            file: outPath,
            nuovo: {
                salesCount: preview.f2.salesCount,
                imponibile: euro(preview.f2.imponibileCents),
                ivaDebito: euro(preview.f2.ivaDebitoCents),
                lordo: euro(preview.f2.lordoCents),
                f3Totale: euro(preview.f3TotalCents),
                f3Righe: preview.f3RowCount,
                byRate: preview.f1.byRate.map((b) => ({
                    aliquota: `${b.vatRate}%`,
                    n: b.salesCount,
                    imponibile: euro(b.imponibileCents),
                    iva: euro(b.ivaDebitoCents),
                    lordo: euro(b.lordoCents),
                })),
            },
            precedente: {
                note: prev.note,
                salesCount: prev.salesCount,
                imponibile: prev.imponibileCents == null ? null : euro(prev.imponibileCents),
                ivaDebito: prev.ivaDebitoCents == null ? null : euro(prev.ivaDebitoCents),
                lordo: prev.lordoCents == null ? null : euro(prev.lordoCents),
            },
            confronto: [
                {
                    label: 'n. vendite',
                    prev: prev.salesCount == null ? 'n/d' : String(prev.salesCount),
                    next: String(preview.f2.salesCount),
                    delta:
                        prev.salesCount == null
                            ? 'n/d'
                            : String(preview.f2.salesCount - prev.salesCount),
                },
                delta('imponibile', prev.imponibileCents, preview.f2.imponibileCents),
                delta('IVA a debito', prev.ivaDebitoCents, preview.f2.ivaDebitoCents),
                delta('lordo', prev.lordoCents, preview.f2.lordoCents),
            ],
            attesoT2:
                q === 2
                    ? {
                          lordoAtteso: '€1246.02',
                          imponibileAttesoApprox: '€1132.75',
                          ivaAttesoApprox: '€113.27',
                          lordoOk: Math.abs(preview.f2.lordoCents - 124602) <= 1,
                          imponibileDeltaCents: preview.f2.imponibileCents - 113275,
                          ivaDeltaCents: preview.f2.ivaDebitoCents - 11327,
                      }
                    : undefined,
        };
        results.push(row);
    }

    console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
    console.error('[preview] FAIL', err);
    process.exit(1);
});
