/**
 * Allinea schema Prisma sul Postgres Neon di produzione (Vercel).
 *
 * IMPORTANTE: `vercel env pull` spesso NON include DATABASE_URL (secret/integration Neon).
 * Aggiungi manualmente in .env.production.local:
 *   DATABASE_URL_UNPOOLED="postgresql://…@ep-….neon.tech/neondb?sslmode=require"
 * (copia da Vercel → Settings → Environment Variables → DATABASE_URL_UNPOOLED → Reveal)
 * oppure da Neon Console → Connection details → Direct connection.
 *
 * Poi: npm run db:neon:push
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { printDatabaseReachabilityHelp } from '../lib/loadEnvFiles';

const PRODUCTION_ENV_FILES = ['.env.production.local', '.env.vercel.production'] as const;

/** Nomi env Neon/Vercel (integrazione Storage) + custom. Ordine: diretta/unpooled prima. */
const DB_URL_KEYS = [
    'DATABASE_URL_UNPOOLED',
    'DATABASE_POSTGRES_URL', // spesso URL completa Neon (verifica assenza -pooler)
    'DATABASE_URL',
    'DATABASE_POSTGRES_PRISMA_URL', // runtime Prisma su Vercel (pgbouncer — ultima scelta per db push)
] as const;

function parseEnvFile(path: string): Record<string, string> {
    const out: Record<string, string> = {};
    if (!existsSync(path)) return out;
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
        }
        out[key] = val;
    }
    return out;
}

/** Legge SOLO i file production (no .env.local) per non puntare a localhost per errore. */
function resolveProductionDatabaseUrl(): string | null {
    const merged: Record<string, string> = {};
    for (const name of PRODUCTION_ENV_FILES) {
        Object.assign(merged, parseEnvFile(resolve(process.cwd(), name)));
    }

    // Priorità: env inline → file production (prima URL completa unpooled/direct)
    let raw = '';
    for (const key of DB_URL_KEYS) {
        const v = process.env[key]?.trim() || merged[key]?.trim();
        if (v) {
            raw = v;
            break;
        }
    }

    // Costruisci da pezzi Neon (DATABASE_PGHOST_UNPOOLED + password) se manca URL completa
    if (!raw) {
        const host =
            process.env.DATABASE_PGHOST_UNPOOLED?.trim() || merged.DATABASE_PGHOST_UNPOOLED?.trim();
        const password =
            process.env.DATABASE_PGPASSWORD?.trim() ||
            merged.DATABASE_PGPASSWORD?.trim() ||
            process.env.DATABASE_POSTGRES_PASSWORD?.trim() ||
            merged.DATABASE_POSTGRES_PASSWORD?.trim();
        const database =
            process.env.DATABASE_PGDATABASE?.trim() ||
            merged.DATABASE_PGDATABASE?.trim() ||
            process.env.DATABASE_POSTGRES_DATABASE?.trim() ||
            merged.DATABASE_POSTGRES_DATABASE?.trim() ||
            'neondb';
        const user =
            process.env.DATABASE_PGUSER?.trim() ||
            merged.DATABASE_PGUSER?.trim() ||
            process.env.DATABASE_POSTGRES_USER?.trim() ||
            merged.DATABASE_POSTGRES_USER?.trim() ||
            'neondb_owner';
        if (host && password) {
            raw = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}/${database}?sslmode=require`;
        }
    }

    if (!raw) {
        console.error(`
Manca una connection string Neon per db push.

Su Vercel NON devi modificare le env: ne copi UNA in locale (solo per questo comando).

Con integrazione Neon (prefisso DATABASE_*), usa in ordine:
  1. DATABASE_POSTGRES_URL          → Reveal → Copy (se l'host NON contiene "-pooler")
  2. DATABASE_PGHOST_UNPOOLED       → + DATABASE_PGPASSWORD (lo script può comporre l'URL)
  3. DATABASE_POSTGRES_PRISMA_URL   → solo se le altre non ci sono (può fallire su db push)

Comando (sostituisci con la stringa REALE copiata):
  DATABASE_POSTGRES_URL='postgresql://…@ep-….neon.tech/neondb?sslmode=require' npm run db:neon:push

Oppure salva in .env.production.local:
  DATABASE_POSTGRES_URL="postgresql://…"
  npm run db:neon:push

Le altre var (NEON_PROJECT_ID, VITE_NEON_AUTH_URL, …) servono all'integrazione Vercel, non a Prisma CLI.
`);
        return null;
    }

    if (raw === '...' || raw.includes('...@...') || !/^postgres(ql)?:\/\//.test(raw)) {
        console.error('DATABASE_URL non valida: incolla la stringa PostgreSQL completa, non "...".');
        return null;
    }

    const placeholderPattern = /USER:PASS|ep-TUO-ID|ep-xxxx|YOUR_|CHANGEME|@ep-\.{3}/i;
    if (placeholderPattern.test(raw)) {
        console.error(`
La connection string contiene ancora testo segnaposto (es. USER:PASS, ep-TUO-ID).

Non usare l'esempio della documentazione: copia la stringa REALE:
  Vercel → Settings → Environment Variables → DATABASE_URL_UNPOOLED → icona occhio → Copy
  oppure Neon Console → Project → Connect → "Direct connection" → Copy
`);
        return null;
    }

    const host = raw.match(/@([^/:?]+)/)?.[1] ?? '';
    if (host === 'localhost' || host === '127.0.0.1') {
        console.error(`
Rilevato host "${host}" — stai per modificare il DB LOCALE, non Neon.

Aggiungi DATABASE_URL_UNPOOLED con host *.neon.tech in .env.production.local (vedi istruzioni sopra).
`);
        return null;
    }

    if (!host.includes('neon')) {
        console.warn(`Attenzione: host "${host}" non sembra Neon (*.neon.tech). Continuo comunque.`);
    }

    return raw;
}

function runPrismaSubcommand(subcommand: 'db push' | 'migrate deploy'): number {
    const url = resolveProductionDatabaseUrl();
    if (!url) return 1;

    const host = url.match(/@([^/:?]+)/)?.[1] ?? '(host sconosciuto)';
    console.log(`→ ${subcommand} verso: ${host}`);

    const args = subcommand === 'db push' ? ['prisma', 'db', 'push'] : ['prisma', 'migrate', 'deploy'];
    const result = spawnSync('npx', args, {
        stdio: 'inherit',
        env: {
            ...process.env,
            DATABASE_URL: url,
            DATABASE_URL_UNPOOLED: url,
        },
        shell: false,
    });

    if (result.status !== 0) {
        printDatabaseReachabilityHelp();
        return result.status ?? 1;
    }

    console.log(`OK: ${subcommand} completato.`);
    return 0;
}

const mode = process.argv[2] === 'migrate' ? 'migrate deploy' : 'db push';
process.exit(runPrismaSubcommand(mode));
