import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Carica .env poi .env.local (come Next.js).
 * Necessario per Prisma CLI: prisma.config.ts non legge .env.local da solo.
 */
export function loadEnvFiles(cwd = process.cwd()): void {
    /** Variabili già nel processo (es. `export DATABASE_URL=...neon`) non vanno sovrascritte da .env.local. */
    const presetKeys = new Set(Object.keys(process.env));

    const fromFiles: Record<string, string> = {};

    for (const name of ['.env', '.env.local']) {
        const p = resolve(cwd, name);
        if (!existsSync(p)) continue;
        for (const line of readFileSync(p, 'utf8').split('\n')) {
            const t = line.trim();
            if (!t || t.startsWith('#')) continue;
            const i = t.indexOf('=');
            if (i === -1) continue;
            const key = t.slice(0, i).trim();
            let val = t.slice(i + 1).trim();
            if (
                (val.startsWith('"') && val.endsWith('"')) ||
                (val.startsWith("'") && val.endsWith("'"))
            ) {
                val = val.slice(1, -1);
            }
            fromFiles[key] = val;
        }
    }

    for (const [key, val] of Object.entries(fromFiles)) {
        if (presetKeys.has(key)) continue;
        process.env[key] = val;
    }
}

export function printDatabaseReachabilityHelp(): void {
    console.error(`
Impossibile raggiungere PostgreSQL (errore P1001).

Il tuo DATABASE_URL punta probabilmente al VPS (94.177.198.140:5432).
Di solito quella porta NON è aperta da Internet per sicurezza.

Scegli UNA di queste strade:

── A) Database locale (Docker sul Mac) ──
  docker compose up -d db
  DATABASE_URL="postgresql://floremoria:floremoria_pw@localhost:5432/floremoria?schema=public" npm run db:migrate:deploy

── B) Migrazione SUL SERVER (consigliato per produzione) ──
  ssh root@94.177.198.140
  cd /var/www/floremoria
  npx prisma migrate deploy

── C) Tunnel SSH (Postgres solo in ascolto su 127.0.0.1 sul VPS) ──
  ssh -L 5433:127.0.0.1:5432 root@94.177.198.140
  # altro terminale:
  DATABASE_URL="postgresql://USER:PASS@127.0.0.1:5433/floremoria?schema=public" npm run db:migrate:deploy
`);
}
