import { existsSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { extractSommario } from '../lib/verbali/paths';

const cwd = process.cwd();
const notesDir = resolve(cwd, 'notes/obsidian/verbali');
const docsDir = resolve(cwd, 'docs/verbali');
const secondBrainDir = '/Users/floremoria/Documents/Second Brain';
const secondBrainVerbaliDir = join(secondBrainDir, '10_FLOREMORIA/10_VERBALI');
const secondBrainLogsDir = join(secondBrainDir, '10_FLOREMORIA/20_ARCHIVIO_LOG');

function cleanTitle(title: string): string {
    return title
        .trim()
        .replace(/[\s_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function normalizeBody(raw: string): string {
    return raw
        .replace(/^---[\s\S]*?---\n/m, '') // rimuove frontmatter
        .replace(/^> Copia sincronizzata automaticamente da[^\n]*\n\n/m, '')
        .replace(/^> Pipeline automatica[^\n]*\n\n/m, '')
        .trim();
}

function updateFrontmatter(content: string, dateStr: string): string {
    const body = normalizeBody(content);
    const [d, m, y] = dateStr.split('-');
    const iso = `${y}-${m}-${d}`;
    const sommario = extractSommario(body, iso);

    // Estrae i tag esistenti se presenti
    let existingTags = ['verbale', 'BARBARA', 'DEVIN', 'FLOREM_NET', 'Regola_Aurea'];
    const tagsMatch = content.match(/tags:\s*\[(.*?)\]/);
    if (tagsMatch) {
        const parsedTags = tagsMatch[1]
            .split(',')
            .map((t) => t.trim().replace(/['"#]/g, ''))
            .filter(Boolean);
        existingTags = Array.from(new Set([...existingTags, ...parsedTags]));
    }

    return `---
date: ${dateStr}
tipo: verbale_giornaliero
tags: [${existingTags.join(', ')}]
sommario: "${sommario.replace(/"/g, '\\"')}"
sync_sources: ["consolidate-clean-move"]
synced_at: ${new Date().toISOString()}
redazione: BARBARA (Antigravity) + DEVIN (Cursor)
---

> Pipeline automatica — fonti: consolidate-clean-move.

${body}
`;
}

async function runCleanAndMove() {
    console.log('--- AVVIO PULIZIA E SPOSTAMENTO VERBALI ---');

    // 1. Processa i file in 10_VERBALI (rimozione dei numeri iniziali, es: "01 20-06-2026...")
    if (existsSync(secondBrainVerbaliDir)) {
        const files = readdirSync(secondBrainVerbaliDir);
        for (const file of files) {
            if (!file.endsWith('.md') || file.startsWith('00_INDEX')) continue;

            // Pattern: optional digits, followed by spaces, followed by date DD-MM-YYYY
            const match = /^(\d+)?\s*(\d{2}-\d{2}-\d{4})\s*(.*)\.md$/.exec(file);
            if (match) {
                const dateStr = match[2];
                const rawTitle = match[3];
                const cleanTitlePart = cleanTitle(rawTitle);
                
                const newFileName = cleanTitlePart 
                    ? `${dateStr}-${cleanTitlePart}.md` 
                    : `${dateStr}-Verbale-giornaliero.md`;

                const oldPath = join(secondBrainVerbaliDir, file);
                if (!existsSync(oldPath)) continue;
                const newPath = join(secondBrainVerbaliDir, newFileName);

                console.log(`[Rinominazione] ${file} -> ${newFileName}`);
                
                const content = readFileSync(oldPath, 'utf8');
                const updatedContent = updateFrontmatter(content, dateStr);

                // Scrivi il nuovo file rinominato ed elimina il vecchio
                writeFileSync(newPath, updatedContent, 'utf8');
                if (oldPath !== newPath) {
                    unlinkSync(oldPath);
                }

                // Sincronizza anche nella repo
                writeFileSync(join(notesDir, newFileName), updatedContent, 'utf8');
                const bodyOnly = normalizeBody(content);
                writeFileSync(join(docsDir, `${dateStr}.md`), bodyOnly + '\n', 'utf8');

                // Se esiste un generico "DD-MM-YYYY-Verbale-giornaliero.md" che ora ha una versione più dettagliata, lo eliminiamo
                if (cleanTitlePart && cleanTitlePart !== 'Verbale-giornaliero') {
                    const genericName = `${dateStr}-Verbale-giornaliero.md`;
                    const genericPath = join(secondBrainVerbaliDir, genericName);
                    const genericRepoPath = join(notesDir, genericName);
                    if (existsSync(genericPath)) {
                        unlinkSync(genericPath);
                        console.log(`[Eliminato generico duplicato in Vault] ${genericName}`);
                    }
                    if (existsSync(genericRepoPath)) {
                        unlinkSync(genericRepoPath);
                        console.log(`[Eliminato generico duplicato in Repo] ${genericName}`);
                    }
                }
            }
        }
    }

    // 2. Processa i file in 20_ARCHIVIO_LOG (spostamento in 10_VERBALI con titolo pulito)
    if (existsSync(secondBrainLogsDir)) {
        const files = readdirSync(secondBrainLogsDir);
        for (const file of files) {
            if (!file.endsWith('.md') || file.startsWith('.')) continue;

            // Pattern: data all'inizio (DD-MM-YYYY) seguita da testo
            const match = /^(\d{2}-\d{2}-\d{4})[_-](.*)\.md$/.exec(file);
            if (match) {
                const dateStr = match[1];
                const rawTitle = match[2];
                const cleanTitlePart = cleanTitle(rawTitle);
                
                const newFileName = `${dateStr}-${cleanTitlePart}.md`;

                const oldPath = join(secondBrainLogsDir, file);
                const newPath = join(secondBrainVerbaliDir, newFileName);

                console.log(`[Spostamento Log] ${file} -> 10_VERBALI/${newFileName}`);

                const content = readFileSync(oldPath, 'utf8');
                const updatedContent = updateFrontmatter(content, dateStr);

                // Scrivi in 10_VERBALI ed elimina da 20_ARCHIVIO_LOG
                writeFileSync(newPath, updatedContent, 'utf8');
                unlinkSync(oldPath);

                // Sincronizza anche nella repo e nei docs
                writeFileSync(join(notesDir, newFileName), updatedContent, 'utf8');
                const bodyOnly = normalizeBody(content);
                writeFileSync(join(docsDir, `${dateStr}.md`), bodyOnly + '\n', 'utf8');
            }
        }
    }

    console.log('--- OPERAZIONE COMPLETATA ---');
}

runCleanAndMove().catch(console.error);
