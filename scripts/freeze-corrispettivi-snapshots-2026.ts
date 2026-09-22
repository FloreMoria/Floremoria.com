/**
 * Congela T1–T3 2026 del Registro Corrispettivi commercialista (prima generazione).
 * Uso: npx tsx scripts/freeze-corrispettivi-snapshots-2026.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { buildCommercialistaCorrispettiviXlsxOrdered } from '@/lib/financial/commercialistaCorrispettiviXlsx';
import { listCorrispettiviSnapshots } from '@/lib/financial/corrispettiviRegisterSnapshot';
import type { TaxQuarter } from '@/lib/financial/taxQuarterly';

async function main() {
    const year = 2026;
    for (const quarter of [1, 2, 3] as TaxQuarter[]) {
        const before = await listCorrispettiviSnapshots(year, quarter);
        const { preview, fromSnapshot, snapshotVersion, contentHash } =
            await buildCommercialistaCorrispettiviXlsxOrdered(
                { kind: 'quarter', year, quarter },
                {}
            );
        const after = await listCorrispettiviSnapshots(year, quarter);
        console.log(
            JSON.stringify(
                {
                    quarter: `T${quarter}`,
                    beforeVersions: before.length,
                    afterVersions: after.length,
                    fromSnapshot,
                    snapshotVersion,
                    contentHash,
                    rowCount: preview.f2RowCount,
                    lordo: (preview.f2.lordoCents / 100).toFixed(2),
                    frozenAt: preview.generatedAtIso,
                },
                null,
                2
            )
        );
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
