import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const prisma = new PrismaClient();
const SYNC_DIR = '/Users/floremoria/Documents/Second Brain/10_FLOREMORIA/20_ARCHIVIO_LOG/Verbali_Barbara';
const GITHUB_REPO = 'https://github.com/FloreMoria/Second_Brain_Sync.git';

async function main() {
  // Ensure the directory exists
  if (!fs.existsSync(SYNC_DIR)) {
    fs.mkdirSync(SYNC_DIR, { recursive: true });
    console.log(`Created directory: ${SYNC_DIR}`);
  }

  // Initialize git if needed
  try {
    if (!fs.existsSync(path.join(SYNC_DIR, '.git'))) {
      execSync('git init', { cwd: SYNC_DIR, stdio: 'inherit' });
      execSync('git checkout -b main', { cwd: SYNC_DIR, stdio: 'inherit' });
      execSync(`git remote add origin ${GITHUB_REPO}`, { cwd: SYNC_DIR, stdio: 'inherit' });
      console.log('Initialized git repository and set remote origin.');
    }
  } catch (error) {
    console.error('Error initializing git:', error);
  }

  console.log('Fetching logs from Prisma...');
  const logs = await prisma.floremoriaLog.findMany({
    orderBy: { sessionDate: 'asc' }
  });

  console.log(`Found ${logs.length} logs to export.`);

  let addedFiles = 0;

  for (const log of logs) {
    // Extract PROTOCOLLO number from topic (e.g. "PROTOCOLLO 109 - ...")
    const match = log.topic?.match(/PROTOCOLLO (\d+)/i);
    const protNum = match ? match[1] : log.id.toString();

    // Format date YYYY-MM-DD
    const dateStr = log.sessionDate.toISOString().split('T')[0];
    const fileName = `${dateStr}_PROT_${protNum.padStart(3, '0')}.md`;
    const filePath = path.join(SYNC_DIR, fileName);

    // Build Markdown content
    const content = `---
date: ${log.sessionDate.toISOString()}
protocollo: ${protNum}
tags: [${log.tag || 'verbale'}]
---

# ${log.topic || 'Verbale'}

**Riassunto:** ${log.shortSummary || ''}

## Testo Integrale
${log.fullText || ''}

## Dettagli Tecnici
- **Prompt Chiave:** ${log.keyPrompt || 'N/A'}
- **Punti Discussi:** ${log.discussedPoints || 'N/A'}
- **Allarmi Critici:** ${log.criticalAlarms || 'N/A'}
- **Task in Sospeso:** ${log.pendingTasks || 'N/A'}
- **Risultati Raggiunti:** ${log.achievedResults || 'N/A'}
`;

    // Write file if it doesn't exist or is different
    if (!fs.existsSync(filePath) || fs.readFileSync(filePath, 'utf8') !== content) {
      fs.writeFileSync(filePath, content);
      console.log(`Generated: ${fileName}`);
      addedFiles++;
    }
  }

  // Git commit and push
  if (addedFiles > 0) {
    console.log('Changes detected. Committing and pushing to GitHub...');
    try {
      execSync('git add .', { cwd: SYNC_DIR, stdio: 'inherit' });
      execSync('git commit -m "Auto-sync: Aggiornamento Verbali di sistema"', { cwd: SYNC_DIR, stdio: 'inherit' });
      
      console.log('Pulling latest changes from remote...');
      execSync('git pull origin main --rebase', { cwd: SYNC_DIR, stdio: 'inherit' });
      
      // Try pushing
      console.log('Attempting git push...');
      execSync('git push -u origin main', { cwd: SYNC_DIR, stdio: 'inherit' });
      console.log('Push completed successfully.');
    } catch (error) {
      console.error('Error during git operations (Push may have failed due to authentication/repo not existing):', (error as any).message);
    }
  } else {
    console.log('No new logs to sync. Everything is up to date.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
