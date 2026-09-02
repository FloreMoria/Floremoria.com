#!/usr/bin/env tsx
/**
 * Benchmark interno visibilità AI (GEO/AEO) — protocollo query + scorecard.
 * Eseguire: npm run audit:ai-visibility
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    auditPublicAiAssets,
    buildBenchmarkMarkdown,
    flattenBenchmarkPrompts,
} from '@/lib/seo/aiVisibilityBenchmark';

const ROOT = process.cwd();
const BENCHMARK_PATH = path.join(ROOT, 'docs/marketing/ai_visibility_benchmark.md');

function main(): void {
    console.info('[audit:ai-visibility] Avvio benchmark GEO/AEO FloreMoria\n');

    const markdown = buildBenchmarkMarkdown();
    fs.mkdirSync(path.dirname(BENCHMARK_PATH), { recursive: true });
    fs.writeFileSync(BENCHMARK_PATH, markdown, 'utf-8');
    console.info(`✓ Protocollo scritto: ${path.relative(ROOT, BENCHMARK_PATH)}`);

    for (const asset of ['public/llms.txt', 'public/llms-full.txt']) {
        const full = path.join(ROOT, asset);
        if (fs.existsSync(full)) {
            console.info(`✓ Asset presente: ${asset} (${fs.statSync(full).size} byte)`);
        } else {
            console.error(`✗ Asset mancante: ${asset}`);
            process.exitCode = 1;
        }
    }

    const audit = auditPublicAiAssets(ROOT);
    if (audit.ok) {
        console.info('✓ Security audit asset pubblici: nessun pattern sensibile rilevato');
    } else {
        console.error('✗ Security audit: problemi rilevati:');
        for (const f of audit.findings) console.error(`  - ${f}`);
        process.exitCode = 1;
    }

    console.info(
        `\n[audit:ai-visibility] Completato (${flattenBenchmarkPrompts().length} prompt). Report dashboard: /dashboard/audit/ai-visibility`
    );
}

main();
