import { existsSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import {
    obsidianGiornalieroFileName,
    docsVerbaleFileName,
    isoFromObsidianGiornaliero,
    extractSommario,
} from '../lib/verbali/paths';
import { mirrorToLocalObsidianVault } from '../lib/verbali/mirrorPaths';

const cwd = process.cwd();
const notesDir = resolve(cwd, 'notes/obsidian/verbali');
const docsDir = resolve(cwd, 'docs/verbali');
const secondBrainDir = '/Users/floremoria/Documents/Second Brain';
const secondBrainVerbaliDir = join(secondBrainDir, '10_FLOREMORIA/10_VERBALI');

function normalizeBody(raw: string): string {
    return raw
        .replace(/^---[\s\S]*?---\n/m, '') // rimuove frontmatter
        .replace(/^> Copia sincronizzata automaticamente da[^\n]*\n\n/m, '')
        .replace(/^> Pipeline automatica[^\n]*\n\n/m, '')
        .trim();
}

async function runConsolidation() {
    console.log('--- AVVIO CONSOLIDAMENTO VERBALI PASSATI ---');

    // 1. Rileva tutte le date dalle note esistenti in repo
    const files = readdirSync(notesDir);
    const dateMap = new Map<string, { bodies: string[]; originalPaths: string[] }>();

    for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const iso = isoFromObsidianGiornaliero(file);
        if (!iso) continue;

        const filePath = join(notesDir, file);
        const rawContent = readFileSync(filePath, 'utf8');
        const body = normalizeBody(rawContent);

        if (!dateMap.has(iso)) {
            dateMap.set(iso, { bodies: [], originalPaths: [] });
        }
        const entry = dateMap.get(iso)!;
        entry.bodies.push(body);
        entry.originalPaths.push(filePath);
    }

    // 2. Cerca file sparsi nel root del Second Brain (es. 08-07-2026.md)
    if (existsSync(secondBrainDir)) {
        const sbFiles = readdirSync(secondBrainDir);
        for (const file of sbFiles) {
            if (!file.endsWith('.md')) continue;
            // Rileva se il nome del file è una data DD-MM-YYYY.md o YYYY-MM-DD.md
            let iso: string | null = null;
            const dmy = /^(\d{2})-(\d{2})-(\d{4})\.md$/.exec(file);
            if (dmy) {
                iso = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
            } else {
                const ymd = /^(\d{4})-(\d{2})-(\d{2})\.md$/.exec(file);
                if (ymd) iso = ymd[1];
            }

            if (iso) {
                const filePath = join(secondBrainDir, file);
                const rawContent = readFileSync(filePath, 'utf8');
                const body = normalizeBody(rawContent);

                if (!dateMap.has(iso)) {
                    dateMap.set(iso, { bodies: [], originalPaths: [] });
                }
                const entry = dateMap.get(iso)!;
                entry.bodies.push(body);
                entry.originalPaths.push(filePath);
            }
        }
    }

    console.log(`Trovate ${dateMap.size} date uniche da elaborare.`);

    for (const [iso, data] of dateMap.entries()) {
        const [y, m, d] = iso.split('-');
        const dateFormatted = `${d}-${m}-${y}`;
        const canonicalObsidianName = obsidianGiornalieroFileName(iso);
        const canonicalDocsName = docsVerbaleFileName(iso);

        const docsPath = join(docsDir, canonicalDocsName);
        const obsidianPath = join(notesDir, canonicalObsidianName);

        // Trova il body più lungo/completo (per evitare di usare scaffold vuoti se c'è del testo reale)
        let bestBody = '';
        for (const b of data.bodies) {
            if (b.length > bestBody.length) {
                bestBody = b;
            }
        }

        // Se esiste il file canonical in docs/verbali, preferiamo quello come sorgente di verità
        if (existsSync(docsPath)) {
            bestBody = normalizeBody(readFileSync(docsPath, 'utf8'));
        }

        // Se non abbiamo un body, saltiamo
        if (!bestBody.trim()) {
            console.log(`[Salta] Nessun contenuto per la data ${iso}`);
            continue;
        }

        // Assicurati che docs/verbali/ contenga il file sorgente pulito
        writeFileSync(docsPath, bestBody.trim() + '\n', 'utf8');

        // Costruisci il file Obsidian standardizzato
        const sommario = extractSommario(bestBody, iso);
        const syncedAt = new Date().toISOString();
        const finalContent = `---
date: ${dateFormatted}
tipo: verbale_giornaliero
tags: [verbale, BARBARA, DEVIN, FLOREM_NET, Regola_Aurea, sync_pipeline]
sommario: "${sommario.replace(/"/g, '\\"')}"
sync_sources: ["consolidate-backfill"]
synced_at: ${syncedAt}
redazione: BARBARA (Antigravity) + DEVIN (Cursor)
---

> Pipeline automatica — fonti: consolidate-backfill.

${bestBody.trim()}
`;

        // Scrivi in notes/obsidian/verbali/
        writeFileSync(obsidianPath, finalContent, 'utf8');

        // Scrivi nel vault di Second Brain reale dell'utente
        mirrorToLocalObsidianVault(iso, finalContent);

        // Pulisci i vecchi file diversi da quello canonico
        for (const origPath of data.originalPaths) {
            if (origPath !== obsidianPath && existsSync(origPath)) {
                unlinkSync(origPath);
                console.log(`[Eliminato vecchio file] ${origPath}`);
            }
        }

        // Pulisci anche eventuali copie obsolete YYYY-MM-DD nel vault reale
        if (existsSync(secondBrainVerbaliDir)) {
            const oldYmdFile = join(secondBrainVerbaliDir, `${iso}-Verbale-Giornaliero.md`);
            if (existsSync(oldYmdFile)) {
                unlinkSync(oldYmdFile);
                console.log(`[Eliminato vecchio file YYYY-MM-DD in Vault] ${oldYmdFile}`);
            }
            const oldYmdFileLower = join(secondBrainVerbaliDir, `${iso}-Verbale-giornaliero.md`);
            if (existsSync(oldYmdFileLower)) {
                unlinkSync(oldYmdFileLower);
                console.log(`[Eliminato vecchio file YYYY-MM-DD in Vault] ${oldYmdFileLower}`);
            }
        }
    }

    console.log('--- CONSOLIDAMENTO COMPLETATO ---');
}

runConsolidation().catch(console.error);
