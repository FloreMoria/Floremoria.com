/**
 * Preview sola lettura: genera FloreMoria_2026_T2_Corrispettivi.xlsx e stampa totali.
 * Uso: npx tsx scripts/preview-commercialista-corrispettivi-t2.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
    assertCommercialistaCorrispettiviPrivacy,
    buildCommercialistaCorrispettiviXlsxOrdered,
} from '@/lib/financial/commercialistaCorrispettiviXlsx';

function euro(cents: number): string {
    return `€ ${(cents / 100).toFixed(2)}`;
}

async function main() {
    const period = { kind: 'quarter' as const, year: 2026, quarter: 2 as const };
    console.log('[preview] Generazione Registro Corrispettivi 2026 T2…');

    const { buffer, preview } = await buildCommercialistaCorrispettiviXlsxOrdered(period);
    await assertCommercialistaCorrispettiviPrivacy(buffer);

    const outDir = path.join(process.cwd(), 'docs', 'verbali');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, preview.filename);
    fs.writeFileSync(outPath, buffer);

    const report = {
        file: outPath,
        filename: preview.filename,
        period: preview.periodLabel,
        generatedAt: preview.generatedAtIso,
        consistencyOk: preview.consistencyOk,
        F1_Riepilogo: {
            salesCount: preview.f1.salesCount,
            imponibile: euro(preview.f1.imponibileCents),
            ivaDebito: euro(preview.f1.ivaDebitoCents),
            lordo: euro(preview.f1.lordoCents),
            byRate: preview.f1.byRate.map((b) => ({
                aliquota: b.vatRate == null ? 'MANCANTE' : `${b.vatRate}%`,
                n: b.salesCount,
                imponibile: euro(b.imponibileCents),
                iva: euro(b.ivaDebitoCents),
                lordo: euro(b.lordoCents),
            })),
        },
        F2_Registro: {
            dataRows: preview.f2RowCount,
            /** +1 intestazione +1 totale (o riga «nessun movimento») */
            sheetRowsApprox: preview.f2RowCount === 0 ? 2 : preview.f2RowCount + 2,
            salesCount: preview.f2.salesCount,
            imponibile: euro(preview.f2.imponibileCents),
            ivaDebito: euro(preview.f2.ivaDebitoCents),
            lordo: euro(preview.f2.lordoCents),
        },
        F3_CostiSenzaDocumento: {
            dataRows: preview.f3RowCount,
            sheetRowsApprox: preview.f3RowCount === 0 ? 2 : preview.f3RowCount + 2,
            totale: euro(preview.f3TotalCents),
        },
    };

    console.log(JSON.stringify(report, null, 2));
    console.log(`[preview] OK → ${outPath} (${buffer.length} bytes)`);
}

main().catch((err) => {
    console.error('[preview] FAIL', err);
    process.exit(1);
});
