import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Carica .env poi .env.local (come Next.js).
 * Necessario per Prisma CLI e script Node che non passano da Next.
 *
 * .env.local vince sempre su .env e su variabili già presenti in process.env
 * per le chiavi database (evita localhost da .env quando in .env.local c'è Neon).
 */
const DB_ENV_KEYS = new Set([
    'DATABASE_URL',
    'DATABASE_URL_UNPOOLED',
    'DATABASE_POSTGRES_URL',
    'DATABASE_POSTGRES_PRISMA_URL',
    'POSTGRES_URL',
    'POSTGRES_URL_NON_POOLING',
    'DATABASE_POSTGRES_PASSWORD',
    'DATABASE_PGHOST',
    'DATABASE_PGHOST_UNPOOLED',
    'DATABASE_PGPASSWORD',
    'DATABASE_PGDATABASE',
    'DATABASE_PGUSER',
]);

export function loadEnvFiles(cwd = process.cwd()): void {
    const fromEnv: Record<string, string> = {};
    const fromLocal: Record<string, string> = {};

    for (const line of readEnvLines(resolve(cwd, '.env'))) {
        fromEnv[line.key] = line.val;
    }
    for (const line of readEnvLines(resolve(cwd, '.env.local'))) {
        fromLocal[line.key] = line.val;
    }

    const presetKeys = new Set(Object.keys(process.env));

    for (const [key, val] of Object.entries(fromEnv)) {
        if (fromLocal[key] !== undefined) continue;
        if (presetKeys.has(key) && !DB_ENV_KEYS.has(key)) continue;
        process.env[key] = val;
    }

    for (const [key, val] of Object.entries(fromLocal)) {
        process.env[key] = val;
    }
}

function readEnvLines(path: string): Array<{ key: string; val: string }> {
    if (!existsSync(path)) return [];
    const out: Array<{ key: string; val: string }> = [];
    for (const line of readFileSync(path, 'utf8').split('\n')) {
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
        } else {
            const hashIdx = val.indexOf('#');
            if (hashIdx >= 0) {
                val = val.slice(0, hashIdx).trim();
            }
        }
        out.push({ key, val });
    }
    return out;
}

export function printDatabaseReachabilityHelp(): void {
    console.error(`
Impossibile raggiungere PostgreSQL (errore P1001 o connessione rifiutata).

Stack produzione: Vercel + Neon (non VPS).

Controlla:
  1. Stringa COMPLETA da Vercel → DATABASE_URL_UNPOOLED (connessione diretta Neon, non pooled).
  2. Deve iniziare con postgresql:// e includere ?sslmode=require (Neon).
  3. Password con caratteri speciali → URL-encode (@ → %40, ecc.).
  4. Progetto Neon attivo (non sospeso) su console.neon.tech

Setup consigliato:
  npx vercel env pull .env.production.local --environment=production
  npm run db:neon:push

Oppure inline (tutta la URL reale, mai "...):
  DATABASE_URL_UNPOOLED='postgresql://…@ep-….neon.tech/neondb?sslmode=require' npm run db:neon:push

Locale (Docker):
  docker compose up -d db
  DATABASE_URL="postgresql://floremoria:floremoria_pw@localhost:5432/floremoria?schema=public" npm run db:migrate:deploy
`);
}
