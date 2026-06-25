/**
 * Backfill: notes/obsidian/verbali/ → Google Drive Obsidian-Mirror/
 * npm run log:verbale:mirror-drive
 */
import { mirrorAllRepoVerbaliToGoogleDrive, resolveGoogleDriveVerbaliRoot } from '../lib/verbali/googleDriveBridge';

const root = resolveGoogleDriveVerbaliRoot();
if (!root) {
    console.error('Cartella Google Drive verbali non trovata. Imposta GOOGLE_DRIVE_VERBALI_DIR in .env.local');
    process.exit(1);
}

const count = mirrorAllRepoVerbaliToGoogleDrive();
console.log(`Mirror Drive: ${count} verbali copiati in ${root}/Obsidian-Mirror/`);
