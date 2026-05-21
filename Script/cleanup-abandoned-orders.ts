/**
 * Soft-delete ordini abbandonati (PENDING + UNPAID) e CANCELLED dalla dashboard.
 * Uso: npx tsx Script/cleanup-abandoned-orders.ts
 *
 * Carica .env poi .env.local (come Next.js) prima di aprire Prisma.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { abandonedDashboardOrdersWhere } from '../lib/dashboardOrdersFilter';

function loadEnvFiles(): void {
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
            if (
                (val.startsWith('"') && val.endsWith('"')) ||
                (val.startsWith("'") && val.endsWith("'"))
            ) {
                val = val.slice(1, -1);
            }
            process.env[key] = val;
        }
    }
}

function databaseHostHint(): string {
    const url = process.env.DATABASE_URL?.trim() || '';
    const match = url.match(/@([^/?]+)/);
    return match?.[1] ?? 'host non configurato';
}

function printConnectionHelp(err: unknown): void {
    const msg = String(err);
    if (!msg.includes("Can't reach database") && !msg.includes('P1001')) return;

    console.error(`
Impossibile connettersi al database.

Host attuale in DATABASE_URL: ${databaseHostHint()}

Checklist:
1) In .env.local usa la connection string Neon (host *.neon.tech), non l'IP diretto del VPS se il DB è su Neon.
2) Aggiungi sslmode=require se manca: ...?sslmode=require
3) Verifica IP allowlist / rete su Neon e che il Mac abbia internet.
4) Prova: npx prisma db execute --stdin <<< "SELECT 1"

Il file .env.local ha priorità su .env (come Next.js).
`);
}

async function main() {
    loadEnvFiles();

    if (!process.env.DATABASE_URL?.trim()) {
        console.error('Manca DATABASE_URL in .env o .env.local');
        process.exit(1);
    }

    console.log(`Connessione DB → ${databaseHostHint()}`);

    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    try {
        const candidates = await prisma.order.findMany({
            where: abandonedDashboardOrdersWhere(),
            select: { id: true, orderNumber: true, status: true, buyerEmail: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
        });

        console.log(`Trovati ${candidates.length} ordini da archiviare.`);

        if (candidates.length === 0) {
            return;
        }

        const result = await prisma.order.updateMany({
            where: abandonedDashboardOrdersWhere(),
            data: { deletedAt: new Date() },
        });

        console.log(`Archiviati (soft-delete) ${result.count} ordini.`);
        for (const order of candidates.slice(0, 10)) {
            console.log(`  - ${order.orderNumber || order.id} | ${order.status} | ${order.buyerEmail || 'no-email'}`);
        }
        if (candidates.length > 10) {
            console.log(`  ... e altri ${candidates.length - 10}`);
        }
    } finally {
        await prisma.$disconnect();
    }
}

main()
    .catch((err) => {
        printConnectionHelp(err);
        console.error('[cleanup-abandoned-orders] Errore:', err);
        process.exitCode = 1;
    });
