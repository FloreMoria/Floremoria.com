import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { defineConfig } from 'prisma/config';

/**
 * Prisma CLI non carica .env.local automaticamente (solo .env).
 * Allineamento a Next.js: .env → .env.local (override).
 */
const cwd = process.cwd();
loadDotenv({ path: resolve(cwd, '.env') });
loadDotenv({ path: resolve(cwd, '.env.local'), override: true });

// Neon/Vercel: preferire UNPOOLED per CLI (migrate, db push).
const cliDatabaseUrl =
    process.env.DATABASE_URL_UNPOOLED?.trim() || process.env.DATABASE_URL?.trim() || '';

if (cliDatabaseUrl) {
    process.env.DATABASE_URL = cliDatabaseUrl;
    if (!process.env.DATABASE_URL_UNPOOLED?.trim()) {
        process.env.DATABASE_URL_UNPOOLED = cliDatabaseUrl;
    }
}

export default defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: {
        path: 'prisma/migrations',
        seed: 'tsx prisma/seed.ts',
    },
    datasource: {
        url: cliDatabaseUrl,
    },
});
