import { defineConfig } from 'prisma/config';
import { loadEnvFiles } from './lib/loadEnvFiles';

loadEnvFiles();

// Neon/Vercel: preferire UNPOOLED per CLI (migrate, db push).
const cliDatabaseUrl =
    process.env.DATABASE_URL_UNPOOLED?.trim() || process.env.DATABASE_URL?.trim() || '';

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
