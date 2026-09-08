/**
 * Fase 1 — esegue i 10 controlli METODO §5 su T2 2026 (sola lettura).
 * Uso: npx tsx scripts/dossier-fiscal-controls-t2-2026.ts
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
import { runAllDossierControls } from '../lib/financial/dossierFiscalControls';

function euro(cents: number) {
    if (!Number.isFinite(cents)) return 'n/d';
    return (cents / 100).toLocaleString('it-IT', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
    });
}

function fmt(r: Awaited<ReturnType<typeof runAllDossierControls>>[0]) {
    if (r.unit === 'cents') return euro(r.measured);
    return String(r.measured);
}

/** Baseline dossier consegnato ad agosto (T2 RIVISTO / originale). */
const AUGUST_BASELINE: Partial<
    Record<string, { measured: number; unit: 'rows' | 'cents' | 'docs'; note: string }>
> = {
    C1: { measured: 19, unit: 'rows', note: 'estratto 72 − PN Fineco 53' },
    C2: { measured: 38790, unit: 'cents', note: 'Σ PN 363,64 − net estratto −24,26' },
    C6: {
        measured: 6,
        unit: 'rows',
        note: 'agosto v1.0: 6 autofatture negative; v1.1 conta solo COPPIE stesso id documento',
    },
    C7: { measured: 12, unit: 'docs', note: 'documenti senza P.IVA/CF nel foglio Acquisti' },
    C10: { measured: 2, unit: 'rows', note: 'fallito su entrambi i gateway' },
};

async function main() {
    const year = 2026;
    const quarter = 2 as const;
    const results = await runAllDossierControls(year, quarter);

    const mismatches: string[] = [];
    for (const r of results) {
        const base = AUGUST_BASELINE[r.id];
        if (!base) continue;
        if (r.id === 'C10') {
            const failedGw = r.perGateway?.filter((g) => !g.passed).length ?? 0;
            if (failedGw !== 2) {
                mismatches.push(
                    `C10: atteso fallimento su 2 gateway (agosto), misurato fallimenti=${failedGw}. ${r.detail}`
                );
            }
            continue;
        }
        if (r.measured !== base.measured) {
            mismatches.push(
                `${r.id}: agosto=${base.unit === 'cents' ? euro(base.measured) : base.measured} (${base.note}) · oggi=${fmt(r)} · ${r.detail}`
            );
        }
    }

    const out = {
        generatedAt: new Date().toISOString(),
        period: 'T2 2026',
        method: 'docs/METODO_DOSSIER_FISCALE.md §5 (v1.1)',
        methodVersion: '1.1',
        phase: 1,
        results: results.map((r) => ({
            id: r.id,
            name: r.name,
            formula: r.formula,
            measured: r.measured,
            measuredDisplay: fmt(r),
            expected: r.expected,
            expectedDisplay: r.unit === 'cents' ? euro(0) : '0',
            delta: r.delta,
            deltaDisplay: r.unit === 'cents' ? euro(r.delta) : String(r.delta),
            unit: r.unit,
            passed: r.passed,
            detail: r.detail,
            perGateway: r.perGateway,
        })),
        augustBaselineCheck: {
            ok: mismatches.length === 0,
            mismatches,
        },
    };

    const dir = path.join(process.cwd(), 'docs/verbali');
    const jsonPath = path.join(dir, 'dossier_fase1_controlli_t2_2026.json');
    fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2), 'utf8');

    const lines = [
        '# Verbale — Dossier Fiscale Fase 1: controlli T2 2026',
        '',
        `**Generato:** ${out.generatedAt}`,
        `**Spec:** \`docs/METODO_DOSSIER_FISCALE.md\` §5`,
        `**Ambito:** sola verifica — nessun cambiamento a dati o generatore XLSX`,
        '',
        '## Esito controlli',
        '',
        '| ID | Controllo | Misurato | Atteso | Scostamento | Esito |',
        '|----|-----------|----------|--------|-------------|-------|',
        ...results.map((r) => {
            const m = fmt(r);
            const e = r.unit === 'cents' ? euro(0) : '0';
            const d = r.unit === 'cents' ? euro(r.delta) : String(r.delta);
            return `| ${r.id} | ${r.name} | ${m} | ${e} | ${d} | ${r.passed ? 'OK' : '**FAIL**'} |`;
        }),
        '',
        '### Dettaglio',
        '',
        ...results.flatMap((r) => [
            `#### ${r.id} — ${r.name}`,
            '',
            `- Formula: ${r.formula}`,
            `- ${r.detail}`,
            ...(r.perGateway || []).map(
                (g) =>
                    `  - **${g.gateway}**: measured=${Number.isFinite(g.measured) ? euro(g.measured) : 'n/d'} · ${g.passed ? 'OK' : 'FAIL'} — ${g.detail}`
            ),
            '',
        ]),
        '## Confronto con baseline dossier agosto',
        '',
        'Valori attesi dal file consegnato ad agosto: **C1 = 19** · **C2 = € 387,90** · **C6 = 6** · **C7 = 12** · **C10 fallito su entrambi**.',
        '',
        mismatches.length === 0
            ? '**Allineato alla baseline agosto** sui controlli chiave.'
            : [
                  '**STOP — scostamento rispetto alla baseline agosto.**',
                  '',
                  'Non si procede alla Fase 2 finché non è chiaro se il controllo è scritto male o i dati sono cambiati.',
                  '',
                  ...mismatches.map((m) => `- ${m}`),
              ].join('\n'),
        '',
        '## File',
        '',
        '- `lib/financial/dossierFiscalControls.ts`',
        '- `scripts/dossier-fiscal-controls-t2-2026.ts`',
        '- `docs/verbali/dossier_fase1_controlli_t2_2026.json`',
        '- `docs/METODO_DOSSIER_FISCALE.md` (specifica, committata in questo giro)',
        '',
    ];

    const mdPath = path.join(dir, 'dossier_fase1_controlli_t2_2026.md');
    fs.writeFileSync(mdPath, lines.join('\n'), 'utf8');

    console.log(JSON.stringify(out, null, 2));
    console.log('\n--- mismatches ---');
    console.log(mismatches.length ? mismatches.join('\n') : 'NONE');
}

main()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
