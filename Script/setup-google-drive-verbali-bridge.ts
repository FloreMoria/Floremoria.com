/**
 * Configura il ponte Google Drive Desktop per i verbali BARBARA.
 *
 * Uso:
 *   npm run verbali:setup-drive
 *   GOOGLE_DRIVE_VERBALI_DIR="/percorso/custom" npm run verbali:setup-drive
 */
import { existsSync, symlinkSync, lstatSync, readlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFiles } from '../lib/loadEnvFiles';
import {
    ensureGoogleDriveVerbaliLayout,
    defaultGoogleDriveVerbaliRoot,
    GOOGLE_DRIVE_VERBALI_SUBDIRS,
} from '../lib/verbali/googleDriveBridge';

loadEnvFiles();

function main(): void {
    const cwd = process.cwd();
    const layout = ensureGoogleDriveVerbaliLayout();
    const repoObsidian = resolve(cwd, 'notes/obsidian/verbali');

    console.log('✓ Ponte Google Drive verbali configurato\n');
    console.log(`Root Drive:     ${layout.root}`);
    console.log(`Ingresso BARBARA: ${layout.ingress}`);
    console.log(`Mirror Obsidian:  ${layout.mirror}`);
    console.log(`Mirror docs:      ${layout.docs}`);
    console.log('');

    // Symlink opzionale: Ingresso-Barbara → stesso vault Barbara se esiste
    const barbaraVault =
        process.env.BARBARA_VERBALI_DIR?.trim() ||
        '/Users/floremoria/Documents/Second Brain/10_FLOREMORIA/20_ARCHIVIO_LOG/Verbali_Barbara';

    if (process.env.VERBALI_DRIVE_SKIP_SYMLINK === '1') {
        console.log('Symlink saltato (VERBALI_DRIVE_SKIP_SYMLINK=1).');
    } else if (existsSync(barbaraVault) && !existsSync(layout.ingress)) {
        try {
            symlinkSync(barbaraVault, layout.ingress, 'dir');
            console.log(`→ Symlink: ${layout.ingress} → ${barbaraVault}`);
        } catch {
            console.log(`→ Cartella ingress creata (symlink vault non applicato).`);
        }
    } else if (existsSync(layout.ingress)) {
        try {
            if (lstatSync(layout.ingress).isSymbolicLink()) {
                console.log(`→ Ingresso già collegato: ${readlinkSync(layout.ingress)}`);
            }
        } catch {
            /* ignore */
        }
    }

    console.log(`
Prossimi passi:
  1. Installa/accendi Google Drive Desktop sul Mac
  2. La cartella "${layout.root}" verrà sincronizzata col cloud
  3. BARBARA: salva o esporta i Google Doc ufficiali in "${GOOGLE_DRIVE_VERBALI_SUBDIRS.ingress}/" come .md
     (nome: YYYY-MM-DD-Verbale-Giornaliero.md oppure YYYY-MM-DD.md)
  4. Pipeline: npm run log:verbale:pipeline  (legge Drive + Second Brain + docs)

.env.local consigliato:
  GOOGLE_DRIVE_VERBALI_DIR="${layout.root}"
`);

    if (!existsSync(resolve(cwd, 'Google Drive'))) {
        console.log(
            `Nota: "${defaultGoogleDriveVerbaliRoot()}" sarà visibile quando Google Drive Desktop monta "Google Drive" in home.`
        );
    }
}

main();
