#!/usr/bin/env tsx
/**
 * Pacchetto immutabile di chiusura trimestre per archivio locale (Mac Salvatore).
 * Perché: fotografia dichiarata + C1–C14 al momento della chiusura; non si sovrascrive in silenzio.
 *
 * Uso:
 *   npm run finance:quarter-closure -- --year=2026 --quarter=3
 *   npm run finance:quarter-closure -- --year=2026 --quarter=3 --force-new-version
 *
 * Output default: archives/fiscal-closures/FloreMoria_YYYY_Tn_chiusura.zip
 * Se esiste già → FloreMoria_YYYY_Tn_chiusura_vYYYYMMDD_HHMM.zip (immutabilità).
 */
import fs from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import JSZip from 'jszip';
import { getBlobWithAccessFallback } from '@/lib/blob/storeAccess';
import { runAllDossierControls } from '@/lib/financial/dossierFiscalControls';
import { buildGatewayCorrispettivi } from '@/lib/financial/dossierCorrispettiviBuild';
import {
    buildTaxQuarterlyReport,
    resolveQuarterBounds,
    type TaxQuarter,
} from '@/lib/financial/taxQuarterly';
import { buildTaxQuarterlyXlsxBuffer } from '@/lib/financial/taxQuarterlyXlsx';
import prisma from '@/lib/prisma';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

type Args = {
    year: number;
    quarter: TaxQuarter;
    outDir: string;
    forceNewVersion: boolean;
};

function parseArgs(argv: string[]): Args {
    const out: Args = {
        year: new Date().getFullYear(),
        quarter: 3,
        outDir: path.join(process.cwd(), 'archives', 'fiscal-closures'),
        forceNewVersion: false,
    };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--year' && argv[i + 1]) out.year = Number(argv[++i]);
        else if (a.startsWith('--year=')) out.year = Number(a.slice(7));
        else if (a === '--quarter' && argv[i + 1]) out.quarter = Number(argv[++i]) as TaxQuarter;
        else if (a.startsWith('--quarter=')) out.quarter = Number(a.slice(10)) as TaxQuarter;
        else if (a === '--out' && argv[i + 1]) out.outDir = path.resolve(argv[++i]);
        else if (a.startsWith('--out=')) out.outDir = path.resolve(a.slice(6));
        else if (a === '--force-new-version') out.forceNewVersion = true;
    }
    if (![1, 2, 3, 4].includes(out.quarter)) {
        throw new Error(`quarter non valido: ${out.quarter}`);
    }
    if (!Number.isFinite(out.year) || out.year < 2020) {
        throw new Error(`year non valido: ${out.year}`);
    }
    return out;
}

function stampLocal(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

function resolveZipPath(outDir: string, year: number, quarter: TaxQuarter, forceNew: boolean): string {
    const base = path.join(outDir, `FloreMoria_${year}_T${quarter}_chiusura.zip`);
    if (!forceNew && !fs.existsSync(base)) return base;
    // Immutabile: non sovrascrivere mai un pacchetto già generato.
    return path.join(outDir, `FloreMoria_${year}_T${quarter}_chiusura_v${stampLocal()}.zip`);
}

async function fetchBlobBytes(blobPath: string, blobUrl: string | null): Promise<Buffer | null> {
    try {
        const blob = await getBlobWithAccessFallback(blobPath, {});
        if (blob?.stream && blob.statusCode === 200) {
            const chunks: Uint8Array[] = [];
            const reader = blob.stream.getReader();
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value) chunks.push(value);
            }
            const total = chunks.reduce((n, c) => n + c.length, 0);
            const out = new Uint8Array(total);
            let offset = 0;
            for (const c of chunks) {
                out.set(c, offset);
                offset += c.length;
            }
            return Buffer.from(out);
        }
    } catch (err) {
        console.warn('[quarter-closure] blob get failed', blobPath, err instanceof Error ? err.message : err);
    }
    if (blobUrl) {
        try {
            const res = await fetch(blobUrl);
            if (res.ok) return Buffer.from(await res.arrayBuffer());
        } catch (err) {
            console.warn('[quarter-closure] blob url failed', blobUrl, err instanceof Error ? err.message : err);
        }
    }
    return null;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const bounds = resolveQuarterBounds(args.year, args.quarter);
    fs.mkdirSync(args.outDir, { recursive: true });
    const zipPath = resolveZipPath(args.outDir, args.year, args.quarter, args.forceNewVersion);
    const generatedAt = new Date().toISOString();

    console.info('[quarter-closure] building', {
        year: args.year,
        quarter: args.quarter,
        label: bounds.label,
        zipPath,
    });

    const [report, controls, corrispettivi, bankDocs, expenses] = await Promise.all([
        buildTaxQuarterlyReport(args.year, args.quarter, { allowIncompleteVat: true }),
        runAllDossierControls(args.year, args.quarter, { allowIncompleteVat: true }),
        buildGatewayCorrispettivi({ start: bounds.start, end: bounds.end }),
        prisma.bankStatementDocument.findMany({
            where: {
                OR: [
                    { periodStart: { gte: bounds.start, lte: bounds.end } },
                    { periodEnd: { gte: bounds.start, lte: bounds.end } },
                    { uploadedAt: { gte: bounds.start, lte: bounds.end } },
                ],
            },
            orderBy: { uploadedAt: 'asc' },
        }),
        prisma.manualFinanceExpense.findMany({
            where: {
                expenseDate: { gte: bounds.start, lte: bounds.end },
            },
            orderBy: { expenseDate: 'asc' },
        }),
    ]);

    const mancantePct = Math.round(corrispettivi.totals.mancanteShare * 1000) / 10;
    const vatWarning =
        corrispettivi.totals.mancanteShare > 0.3
            ? `ATTENZIONE: aliquota MANCANTE su ${mancantePct}% del lordo gateway (soglia ufficiale export 30%). Pacchetto generato come fotografia con allowIncompleteVat.`
            : null;

    const dossierXlsx = await buildTaxQuarterlyXlsxBuffer(report, { allowIncompleteVat: true });
    const zip = new JSZip();

    zip.file(
        `01_dossier/Dossier_Fiscale_FloreMoria_${args.year}_T${args.quarter}.xlsx`,
        dossierXlsx
    );

    zip.file(
        `02_corrispettivi/registro_corrispettivi_${args.year}_T${args.quarter}.json`,
        JSON.stringify(
            {
                period: bounds.label,
                generatedAt,
                rowCount: corrispettivi.rows.length,
                rows: corrispettivi.rows,
                exceptions: corrispettivi.exceptions,
                totals: corrispettivi.totals,
            },
            null,
            2
        )
    );

    const corrCsvHeader =
        'date,canaleIncasso,transactionId,orderNumber,grossCents,vatRate,vatCertainty,imponibileCents,ivaCents\n';
    const corrCsvBody = corrispettivi.rows
        .map((r) =>
            [
                r.date,
                r.canaleIncasso,
                r.transactionId,
                r.orderNumber,
                r.grossCents,
                r.vatRate,
                r.vatCertainty,
                r.imponibileCents,
                r.ivaCents,
            ]
                .map((c) => `"${String(c).replace(/"/g, '""')}"`)
                .join(',')
        )
        .join('\n');
    zip.file(
        `02_corrispettivi/registro_corrispettivi_${args.year}_T${args.quarter}.csv`,
        corrCsvHeader + corrCsvBody + '\n'
    );

    const bankMeta: Array<Record<string, unknown>> = [];
    for (const doc of bankDocs) {
        const safeName = (doc.fileName || doc.id).replace(/[^\w.\-]+/g, '_');
        const bytes = await fetchBlobBytes(doc.blobPath, doc.blobUrl);
        if (bytes) {
            zip.file(`03_estratti_bancari/${safeName}`, bytes);
        }
        bankMeta.push({
            id: doc.id,
            fileName: doc.fileName,
            periodStart: doc.periodStart,
            periodEnd: doc.periodEnd,
            uploadedAt: doc.uploadedAt,
            blobPath: doc.blobPath,
            attached: Boolean(bytes),
        });
    }
    zip.file(`03_estratti_bancari/index.json`, JSON.stringify({ generatedAt, documents: bankMeta }, null, 2));

    const expenseMeta: Array<Record<string, unknown>> = [];
    for (const exp of expenses) {
        const base = `${exp.expenseDate.toISOString().slice(0, 10)}_${exp.id}`;
        let attached = false;
        if (exp.blobPath) {
            const bytes = await fetchBlobBytes(exp.blobPath, exp.blobUrl);
            if (bytes) {
                const ext = path.extname(exp.blobPath) || '.bin';
                zip.file(`04_fatture_passive/${base}${ext}`, bytes);
                attached = true;
            }
        }
        expenseMeta.push({
            id: exp.id,
            expenseDate: exp.expenseDate,
            vendorName: exp.vendorName,
            docType: exp.docType,
            totalCents: exp.totalCents,
            periodKey: exp.periodKey,
            blobPath: exp.blobPath,
            attached,
        });
    }
    zip.file(
        `04_fatture_passive/index.json`,
        JSON.stringify({ generatedAt, expenses: expenseMeta }, null, 2)
    );

    const controlsSummary = {
        generatedAt,
        period: bounds.label,
        year: args.year,
        quarter: args.quarter,
        passed: controls.filter((c) => c.verifiable !== false && c.passed).length,
        failed: controls.filter((c) => c.verifiable !== false && !c.passed).length,
        notVerifiable: controls.filter((c) => c.verifiable === false).length,
        controls,
    };
    zip.file(`05_controlli_C1_C14/esiti_${args.year}_T${args.quarter}.json`, JSON.stringify(controlsSummary, null, 2));

    const readme = [
        `# FloreMoria — chiusura fiscale ${bounds.label}`,
        '',
        `Generato: ${generatedAt}`,
        `Pacchetto: ${path.basename(zipPath)}`,
        '',
        'Contenuto:',
        `- 01_dossier/ — Dossier fiscale XLSX (stesso motore Contabilità)`,
        `- 02_corrispettivi/ — Registro corrispettivi JSON + CSV`,
        `- 03_estratti_bancari/ — Estratti del periodo (allegati Blob se disponibili) + index.json`,
        `- 04_fatture_passive/ — Fatture/spese passive del periodo + allegati + index.json`,
        `- 05_controlli_C1_C14/ — Esiti controlli al momento della chiusura`,
        '',
        'Immutabilità: questo ZIP non va rigenerato sovrascrivendo. Per una nuova fotografia usare',
        '`--force-new-version` (crea file `_vYYYYMMDD_HHMM` accanto al precedente).',
        '',
        `Controlli: passed=${controlsSummary.passed} failed=${controlsSummary.failed} notVerifiable=${controlsSummary.notVerifiable}`,
        `Corrispettivi: ${corrispettivi.rows.length} righe`,
        `Estratti bancari: ${bankDocs.length} documenti`,
        `Fatture passive: ${expenses.length} record`,
        vatWarning ? `\n${vatWarning}` : '',
        '',
    ].join('\n');
    zip.file('README.md', readme);
    zip.file(
        'manifest.json',
        JSON.stringify(
            {
                package: path.basename(zipPath),
                generatedAt,
                periodLabel: bounds.label,
                year: args.year,
                quarter: args.quarter,
                contents: [
                    '01_dossier',
                    '02_corrispettivi',
                    '03_estratti_bancari',
                    '04_fatture_passive',
                    '05_controlli_C1_C14',
                    'README.md',
                ],
                controlsSummary: {
                    passed: controlsSummary.passed,
                    failed: controlsSummary.failed,
                    notVerifiable: controlsSummary.notVerifiable,
                },
                counts: {
                    corrispettiviRows: corrispettivi.rows.length,
                    bankDocuments: bankDocs.length,
                    passiveExpenses: expenses.length,
                },
                vatWarning,
            },
            null,
            2
        )
    );

    const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    fs.writeFileSync(zipPath, buf);
    console.info('[quarter-closure] OK', {
        zipPath,
        bytes: buf.length,
        controls: {
            passed: controlsSummary.passed,
            failed: controlsSummary.failed,
            notVerifiable: controlsSummary.notVerifiable,
        },
    });
}

main()
    .catch((err) => {
        console.error('[quarter-closure] FAIL', err instanceof Error ? err.message : err);
        if (err instanceof Error && err.stack) console.error(err.stack);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect().catch(() => undefined);
    });
