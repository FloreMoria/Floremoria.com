/**
 * Genera/sovrascrive il verbale docs/verbali/DD-MM-YYYY.md per un giorno ISO
 * (default: ieri, Europe/Rome) da .today_log.txt + git log 00:00–23:59.
 *
 *   VERBALE_ISO=2026-08-23 npx tsx Script/generate-daily-verbale.ts
 *   npm run log:verbale:generate-yesterday
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { generateVerbaleFromOperations } from '../lib/verbali/generateFromOperations';
import { docsVerbalePath, docsVerbaleRel } from '../lib/verbali/paths';
import { isoYesterdayRome } from '../lib/verbali/romeDate';
import { dropIsoLinesFromTodayLog } from '../lib/verbali/todayLog';

function resolveIso(): string {
    const raw = (process.env.VERBALE_ISO || process.env.VERBALE_FORCE_ISO || '').trim();
    if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    if (raw) {
        console.warn(`VERBALE_ISO ignorato (formato non YYYY-MM-DD): ${raw}`);
    }
    return isoYesterdayRome();
}

async function main(): Promise<void> {
    const cwd = process.cwd();
    const iso = resolveIso();
    const generated = await generateVerbaleFromOperations(cwd, iso);

    if (!generated) {
        console.log(`Nessun commit Git né riga .today_log per ${iso}: verbale non scritto.`);
        process.exit(0);
    }

    const docsPath = docsVerbalePath(cwd, iso);
    mkdirSync(dirname(docsPath), { recursive: true });
    writeFileSync(docsPath, generated.markdown, 'utf8');
    console.log(`Scritto ${docsVerbaleRel(iso)}`);
    console.log(generated.shortSummary);

    if (process.env.VERBALE_DROP_LOG === '1') {
        dropIsoLinesFromTodayLog(iso, cwd);
        console.log(`Rimosse dal buffer le righe [${iso}].`);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
