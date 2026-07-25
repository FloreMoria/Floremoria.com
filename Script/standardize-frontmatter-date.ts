import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const cwd = process.cwd();
const notesDir = resolve(cwd, 'notes/obsidian/verbali');
const secondBrainDir = '/Users/floremoria/Documents/Second Brain/10_FLOREMORIA/10_VERBALI';

function standardizeFrontmatterInDir(dirPath: string) {
    if (!existsSync(dirPath)) return;
    console.log(`Elaborazione frontmatter in: ${dirPath}`);
    const files = readdirSync(dirPath);

    for (const file of files) {
        if (!file.endsWith('.md') || file.startsWith('00_INDEX')) continue;

        const filePath = join(dirPath, file);
        let content = readFileSync(filePath, 'utf8');

        // Trova il blocco frontmatter --- ... ---
        const frontmatterMatch = /^---([\s\S]*?)---/.exec(content);
        if (frontmatterMatch) {
            const rawFrontmatter = frontmatterMatch[1];
            
            // Cerca date nel formato date: DD-MM-YYYY
            const dateMatch = /date:\s*(\d{2})-(\d{2})-(\d{4})/.exec(rawFrontmatter);
            if (dateMatch) {
                const [_, d, m, y] = dateMatch;
                const isoDate = `${y}-${m}-${d}`;
                
                // Sostituisce nel frontmatter
                const updatedFrontmatter = rawFrontmatter.replace(
                    /date:\s*\d{2}-\d{2}-\d{4}/,
                    `date: ${isoDate}`
                );
                
                content = content.replace(rawFrontmatter, updatedFrontmatter);
                writeFileSync(filePath, content, 'utf8');
                console.log(`[Aggiornato Frontmatter] ${file} -> date: ${isoDate}`);
            }
        }
    }
}

async function run() {
    console.log('--- AVVIO STANDARDIZZAZIONE DATE FRONTMATTER ---');
    standardizeFrontmatterInDir(notesDir);
    standardizeFrontmatterInDir(secondBrainDir);
    console.log('--- OPERAZIONE COMPLETATA ---');
}

run().catch(console.error);
