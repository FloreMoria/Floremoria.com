import { existsSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { isEmptyScaffold } from '../lib/verbali/paths';

const cwd = process.cwd();
const notesDir = resolve(cwd, 'notes/obsidian/verbali');
const secondBrainDir = '/Users/floremoria/Documents/Second Brain/10_FLOREMORIA/10_VERBALI';

function deleteEmptyInDir(dirPath: string, deleteInRepoNotes = false) {
    if (!existsSync(dirPath)) return;
    console.log(`Verifica verbali vuoti in: ${dirPath}`);
    const files = readdirSync(dirPath);

    for (const file of files) {
        if (!file.endsWith('.md') || file.startsWith('00_INDEX')) continue;

        const filePath = join(dirPath, file);
        const content = readFileSync(filePath, 'utf8').trim();

        // Criteri di vuoto:
        // 1. Corrisponde a isEmptyScaffold (4+ occorrenze di Da compilare o tipo: verbale_giornaliero_auto)
        // 2. Contenuto effettivo (senza frontmatter) quasi assente o contenente solo "Da compilare"
        const cleanBody = content.replace(/^---[\s\S]*?---\n/m, '').trim();
        const isActuallyEmpty = 
            cleanBody.length < 50 || 
            cleanBody.includes('(Da compilare)') ||
            isEmptyScaffold(content);

        if (isActuallyEmpty) {
            console.log(`[Cancellazione] Trovato verbale vuoto: ${file}`);
            unlinkSync(filePath);

            // Se stiamo pulendo il vault di Obsidian, proviamo a cancellare anche il corrispondente nel repository per tenerli allineati
            if (deleteInRepoNotes) {
                const repoPath = join(notesDir, file);
                if (existsSync(repoPath)) {
                    unlinkSync(repoPath);
                    console.log(`[Cancellazione Repo] Allineato ed eliminato anche in repo: ${file}`);
                }
            }
        }
    }
}

async function run() {
    console.log('--- AVVIO CANCELLAZIONE VERBALI VUOTI ---');
    // Puliamo prima il repository
    deleteEmptyInDir(notesDir);
    // Puliamo il vault Obsidian e allineiamo al repo
    deleteEmptyInDir(secondBrainDir, true);
    console.log('--- OPERAZIONE COMPLETATA ---');
}

run().catch(console.error);
