/**
 * Allinea notes/obsidian/verbali/ da docs/verbali/DD-MM-YYYY.md.
 * Usato da: npm run log:verbale:sync-docs, GitHub Actions (push su docs/verbali), daily-verbale-sync.
 *
 * Se VERBALE_RESET_TODAY_LOG=1 (impostato dal cron di chiusura giornata),
 * dopo la sync Obsidian svuota docs/verbali/.today_log.txt.
 */
import { syncAllDocsVerbali } from '../lib/verbali/docsToObsidian';
import { resetTodayLog } from '../lib/verbali/todayLog';

function main(): void {
    const results = syncAllDocsVerbali();
    if (results.length === 0) {
        console.log('Nessun file in docs/verbali/ da sincronizzare.');
    } else {
        for (const r of results) {
            const rel = r.obsidianPath.replace(process.cwd() + '/', '');
            if (r.action === 'skipped') {
                console.log(`[skip] ${r.iso}: ${r.reason} (${rel})`);
            } else {
                console.log(`[${r.action}] ${r.iso} → ${rel}`);
            }
        }
    }

    // Solo chiusura giornata (cron): non resettare se sync-docs è lanciato a mano in giornata
    if (process.env.VERBALE_RESET_TODAY_LOG === '1') {
        resetTodayLog();
        console.log('Reset .today_log.txt (0 byte) dopo sync Obsidian.');
    }
}

main();
