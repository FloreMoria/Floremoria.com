/**
 * Allinea notes/obsidian/verbali/ da docs/verbali/DD-MM-YYYY.md.
 * Usato da: npm run log:verbale:sync-docs, GitHub Actions (push su docs/verbali), daily-verbale-sync.
 */
import { syncAllDocsVerbali } from '../lib/verbali/docsToObsidian';

function main(): void {
    const results = syncAllDocsVerbali();
    if (results.length === 0) {
        console.log('Nessun file in docs/verbali/ da sincronizzare.');
        return;
    }

    for (const r of results) {
        const rel = r.obsidianPath.replace(process.cwd() + '/', '');
        if (r.action === 'skipped') {
            console.log(`[skip] ${r.iso}: ${r.reason} (${rel})`);
        } else {
            console.log(`[${r.action}] ${r.iso} → ${rel}`);
        }
    }
}

main();
