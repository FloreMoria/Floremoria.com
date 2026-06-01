import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvFiles(): void {
  if (process.env.DATABASE_URL) return;
  for (const name of ['.env', '.env.local']) {
    const p = resolve(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i === -1) continue;
      const key = t.slice(0, i).trim();
      let val = t.slice(i + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

async function main() {
  loadEnvFiles();
  const prisma = new PrismaClient();
  try {
    const count = await prisma.floremoriaLog.count();
    console.log(`Total logs in floremoria_logs table: ${count}`);
    const logs = await prisma.floremoriaLog.findMany({
      orderBy: { sessionDate: 'desc' },
      take: 20,
      select: {
        id: true,
        sessionDate: true,
        tag: true,
        topic: true,
        shortSummary: true
      }
    });
    console.log('\nLast 20 logs:');
    logs.forEach(l => {
      console.log(`- [${l.sessionDate.toISOString().slice(0,10)}] TAG: ${l.tag} | TOPIC: ${l.topic} | SUMMARY: ${l.shortSummary}`);
    });
  } catch (e) {
    console.error('Error fetching logs:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
