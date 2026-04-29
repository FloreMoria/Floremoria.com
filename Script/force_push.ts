import { execSync } from 'child_process';
const SYNC_DIR = '/Users/floremoria/Downloads/Second_Brain_Sync';

try {
  console.log('Pulling latest changes from remote...');
  execSync('git pull origin main --rebase', { cwd: SYNC_DIR, stdio: 'inherit' });
  
  console.log('Adding and committing...');
  execSync('git add .', { cwd: SYNC_DIR, stdio: 'inherit' });
  try {
    execSync('git commit -m "Auto-sync: Aggiornamento Verbali di sistema"', { cwd: SYNC_DIR, stdio: 'inherit' });
  } catch (e) {
    console.log('Nothing new to commit.');
  }

  console.log('Pushing to GitHub...');
  execSync('git push -u origin main', { cwd: SYNC_DIR, stdio: 'inherit' });
  console.log('Push successful!');
} catch (error) {
  console.error('Error:', (error as any).message);
}
