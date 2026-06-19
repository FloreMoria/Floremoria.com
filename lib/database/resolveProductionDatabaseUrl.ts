/**
 * Risolve DATABASE_URL Neon/Vercel produzione senza leggere .env.local (evita localhost).
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PRODUCTION_ENV_FILES = [
    '.env.production.local',
    '.env.vercel.production.local',
    '.env.vercel.production',
] as const;

const DB_URL_KEYS = [
    'DATABASE_URL_UNPOOLED',
    'POSTGRES_URL_NON_POOLING',
    'DATABASE_POSTGRES_URL',
    'POSTGRES_URL',
    'DATABASE_URL',
    'DATABASE_POSTGRES_PRISMA_URL',
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

export function resolveProductionDatabaseUrl(cwd: string = process.cwd()): string | null {
    const merged: Record<string, string> = {};
    for (const name of PRODUCTION_ENV_FILES) {
        Object.assign(merged, parseEnvFile(resolve(cwd, name)));
    }

    for (const key of DB_URL_KEYS) {
        const v = process.env[key]?.trim() || merged[key]?.trim();
        if (v) return v;
    }

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
        return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}/${database}?sslmode=require`;
    }

    return null;
}
