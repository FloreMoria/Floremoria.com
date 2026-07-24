import { existsSync, readdirSync, renameSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';

const cwd = process.cwd();
const notesDir = resolve(cwd, 'notes/obsidian/verbali');
const secondBrainDir = '/Users/floremoria/Documents/Second Brain/10_FLOREMORIA/10_VERBALI';

function renameToIsoInDir(dirPath: string) {
    if (!existsSync(dirPath)) return;
    console.log(`\nElaborazione cartella: ${dirPath}`);
    const files = readdirSync(dirPath);

    // Mappa per rilevare duplicati per data (iso -> elenco file)
    const dateMap = new Map<string, string[]>();

    for (const file of files) {
        if (!file.endsWith('.md') || file.startsWith('00_INDEX')) continue;

        // Pattern 1: DD-MM-YYYY-Titolo.md
        const dmyMatch = /^(\d{2})-(\d{2})-(\d{4})-(.*)\.md$/.exec(file);
        if (dmyMatch) {
            const [_, d, m, y, title] = dmyMatch;
            const iso = `${y}-${m}-${d}`;
            const newName = `${iso}-${title}.md`;

            const oldPath = join(dirPath, file);
            const newPath = join(dirPath, newName);

            console.log(`[Rinominazione] ${file} -> ${newName}`);
            renameSync(oldPath, newPath);

            if (!dateMap.has(iso)) dateMap.set(iso, []);
            dateMap.get(iso)!.push(newName);
        } else {
            // Pattern 2: YYYY-MM-DD-Titolo.md (già in ISO, lo tracciamo comunque per i duplicati)
            const ymdMatch = /^(\d{4})-(\d{2})-(\d{2})-(.*)\.md$/.exec(file);
            if (ymdMatch) {
                const iso = `${ymdMatch[1]}-${ymdMatch[2]}-${ymdMatch[3]}`;
                if (!dateMap.has(iso)) dateMap.set(iso, []);
                dateMap.get(iso)!.push(file);
            }
        }
    }

    // Risoluzione dei duplicati: se per una data abbiamo sia il "Verbale-giornaliero.md" che un file più dettagliato, eliminiamo quello generico
    for (const [iso, filenames] of dateMap.entries()) {
        if (filenames.length > 1) {
            const genericName = `${iso}-Verbale-giornaliero.md`;
            const hasDetailed = filenames.some(f => f !== genericName);
            if (hasDetailed) {
                const genericPath = join(dirPath, genericName);
                if (existsSync(genericPath)) {
                    unlinkSync(genericPath);
                    console.log(`[Eliminato duplicato generico] ${genericName}`);
                }
            }
        }
    }
}

async function runRenameToIso() {
    console.log('--- AVVIO RINOMINAZIONE VERBALI IN YYYY-MM-DD ---');
    renameToIsoInDir(notesDir);
    renameToIsoInDir(secondBrainDir);
    console.log('--- OPERAZIONE COMPLETATA ---');
}

runRenameToIso().catch(console.error);
