/**
 * Fase 2 — verifica Acquisti T2 post §6.4 + generazione dossier di controllo.
 * Uso: npx tsx scripts/dossier-fase2-verify-t2-2026.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();
if (process.env.DATABASE_URL_UNPOOLED) {
    process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
}

import fs from 'fs';
import path from 'path';
import prisma from '../lib/prisma';
import { buildTaxQuarterlyReport } from '../lib/financial/taxQuarterly';
import {
    buildTaxQuarterlyXlsxBuffer,
    measureAcquistiImponibileCents,
    DOSSIER_METHOD_VERSION,
} from '../lib/financial/taxQuarterlyXlsx';
import { resolveAcquistiSheetRows } from '../lib/financial/dossierAcquistiBuild';

const TARGET_IMPONIBILE_CENTS = 85553; // € 855,53
const LEGACY_CANCELLED_CENTS = 78008; // € 780,08 (pre §6.4)

async function main() {
    const report = await buildTaxQuarterlyReport(2026, 2);
    const { rows, exceptions } = await resolveAcquistiSheetRows(report);
    const measured = await measureAcquistiImponibileCents(report);

    const ok = measured.imponibileCents === TARGET_IMPONIBILE_CENTS;
    const section64 = exceptions.filter((e) =>
        e.perche.includes('documento già acquisito da altro canale')
    );

    const outDir = path.join(process.cwd(), 'docs/verbali');
    const xlsxPath = path.join(
        outDir,
        `Dossier_Fiscale_FloreMoria_2026_T2_v${DOSSIER_METHOD_VERSION}_fase2.xlsx`
    );
    const buffer = await buildTaxQuarterlyXlsxBuffer(report);
    fs.writeFileSync(xlsxPath, buffer);

    const result = {
        generatedAt: new Date().toISOString(),
        methodVersion: DOSSIER_METHOD_VERSION,
        phase: 2,
        period: report.bounds.label,
        acquistiImponibileCents: measured.imponibileCents,
        acquistiImponibileEuro: measured.imponibileCents / 100,
        targetCents: TARGET_IMPONIBILE_CENTS,
        legacyCancelledCents: LEGACY_CANCELLED_CENTS,
        section64Ok: ok,
        exceptionCountTotal: exceptions.length + 0,
        section64Exceptions: section64.length,
        section64Details: section64,
        acquistiRowCount: rows.length,
        xlsxPath,
    };

    fs.writeFileSync(
        path.join(outDir, 'dossier_fase2_quadratura_eccezioni_t2_2026.json'),
        JSON.stringify(result, null, 2),
        'utf8'
    );

    const md = [
        '# Verbale — Dossier Fiscale Fase 2 (METODO v1.2)',
        '',
        `**Generato:** ${result.generatedAt}`,
        `**Spec:** \`docs/METODO_DOSSIER_FISCALE.md\` v${DOSSIER_METHOD_VERSION} — §4 Quadratura · §6.4 · §9 Eccezioni`,
        '',
        '## Verifica §6.4 (gate di chiusura)',
        '',
        `| | Valore |`,
        `|---|---|`,
        `| Imponibile Acquisti T2 | **€ ${(measured.imponibileCents / 100).toFixed(2).replace('.', ',')}** |`,
        `| Atteso | € 855,53 |`,
        `| Pre-§6.4 (cancellazione coppie) | € 780,08 |`,
        `| Eccezioni «documento già acquisito da altro canale» | **${section64.length}** |`,
        `| Esito | ${ok && section64.length === 6 ? '**PASS**' : '**FAIL**'} |`,
        '',
        '## Fogli aggiunti',
        '',
        '- **Quadratura** (foglio 0): esito controlli, liquidazione IVA §4.2, raccordo finanziario, CE parziale, tracciabilità §12',
        '- **Eccezioni** (ultimo foglio): sempre presente; include le 6 doppie ingestioni §6.4 + controlli falliti',
        '- **Acquisti**: ridenominato; una sola riga per documento estero (sopravvive il canale saas / forma positiva + IVA RC)',
        '',
        '## File',
        '',
        `- \`${xlsxPath.replace(process.cwd() + '/', '')}\``,
        '- `lib/financial/dossierAcquistiBuild.ts`',
        '- `lib/financial/taxQuarterlyXlsx.ts`',
        '',
        ok && section64.length === 6
            ? '**Fase 2 chiusa.** Prossimo: Fase 3 — Registro corrispettivi (§8), su OK.'
            : '**STOP — §6.4 non applicata correttamente.**',
        '',
    ].join('\n');

    fs.writeFileSync(
        path.join(outDir, 'dossier_fase2_quadratura_eccezioni_t2_2026.md'),
        md,
        'utf8'
    );

    console.log(JSON.stringify(result, null, 2));
    if (!ok || section64.length !== 6) {
        process.exitCode = 1;
    }
}

main()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
