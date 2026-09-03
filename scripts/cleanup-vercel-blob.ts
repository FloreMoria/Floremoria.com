#!/usr/bin/env npx tsx
/**
 * Audit & pulizia sicura Vercel Blob (Hobby 1 GB).
 *
 * Uso:
 *   npx tsx scripts/cleanup-vercel-blob.ts              # dry-run store da BLOB_READ_WRITE_TOKEN
 *   npx tsx scripts/cleanup-vercel-blob.ts --execute    # cancella candidati safe
 *
 * Store foto consegne (OIDC-only): usare POST /api/cron/cleanup-blob su produzione.
 */

import { loadEnvFiles } from '../lib/loadEnvFiles';
import { formatMb, runSafeBlobCleanup } from '../lib/blob/cleanupSafeBlobs';

loadEnvFiles();

// Preferisci Neon unpooled se DATABASE_URL punta a localhost (dev Docker spento).
(() => {
    const url = process.env.DATABASE_URL || '';
    const unpooled = process.env.DATABASE_URL_UNPOOLED?.trim();
    if (unpooled && (/localhost|127\.0\.0\.1/.test(url) || !url)) {
        process.env.DATABASE_URL = unpooled;
    }
})();

const EXECUTE = process.argv.includes('--execute');

async function main() {
    const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
    if (!token) {
        console.error('❌ BLOB_READ_WRITE_TOKEN mancante (.env.local).');
        process.exit(1);
    }

    console.log('\n═══════════════════════════════════════════════════');
    console.log(' Vercel Blob — Audit & pulizia sicura FloreMoria');
    console.log(` Mode: ${EXECUTE ? 'EXECUTE' : 'DRY-RUN'}`);
    console.log(` Store ID: ${process.env.BLOB_STORE_ID || '(da token)'}`);
    console.log('═══════════════════════════════════════════════════\n');

    const report = await runSafeBlobCleanup({ dryRun: !EXECUTE, token });

    console.log(`Totale store: ${report.totalFiles} file · ${formatMb(report.totalBytes)} MB\n`);
    console.log('Occupazione per prefisso (top 15):');
    for (const p of report.byPrefix.slice(0, 15)) {
        console.log(
            `  ${formatMb(p.bytes).padStart(8)} MB · ${String(p.count).padStart(4)} · ${p.prefix}`,
        );
    }

    console.log(`\nCandidati safe: ${report.candidateCount} file · ${formatMb(report.candidateBytes)} MB`);
    for (const [reason, v] of Object.entries(report.byReason).sort(
        (a, b) => b[1].bytes - a[1].bytes,
    )) {
        console.log(
            `  · ${formatMb(v.bytes).padStart(8)} MB · ${String(v.count).padStart(4)} · ${reason}`,
        );
    }

    if (!EXECUTE) {
        console.log('\n⚠️  DRY-RUN: nessuna cancellazione. Rilancia con --execute.');
        console.log(`  Residuo stimato: ${formatMb(report.residualBytesEstimate)} MB`);
        return;
    }

    console.log(
        `\n✅ Liberati: ${formatMb(report.deletedBytes)} MB (${report.deletedCount} file, errori=${report.errors})`,
    );
    console.log(`   Residuo stimato store: ${formatMb(report.residualBytesEstimate)} MB`);
    if (report.residualBytesEstimate < 800 * 1024 * 1024) {
        console.log('   ✅ Sotto soglia sicurezza (< 800 MB) per QUESTO store');
    }
}

main().catch((err) => {
    console.error('❌ cleanup-vercel-blob fallito:', err);
    process.exit(1);
});
