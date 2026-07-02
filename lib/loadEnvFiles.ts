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
            } else {
                const hashIdx = val.indexOf('#');
                if (hashIdx >= 0) {
                    val = val.slice(0, hashIdx).trim();
                }
            }
            // Evita che una riga vuota in fondo al file sovrascriva un token gia impostato.
            if (val === '' && fromFiles[key]?.trim()) {
                continue;
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
