/**
 * Applica colonna delivery_photo_urls su DeceasedProfile.
 * Uso: npx tsx scripts/apply-deceased-delivery-photo-urls-migration.ts
 */
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { resolveProductionDatabaseUrl } from '../lib/database/resolveProductionDatabaseUrl';
import { loadEnvFiles } from '../lib/loadEnvFiles';

loadEnvFiles();

const MIGRATION_NAME = '20260820095000_deceased_delivery_photo_urls';

const url =
    resolveProductionDatabaseUrl(process.cwd()) ||
    (process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || '').trim();

if (!url) {
    console.error('Manca DATABASE_URL Neon produzione');
    process.exit(1);
}

const host = url.match(/@([^/:]+)/)?.[1] ?? '?';
if (host === 'localhost' || host === '127.0.0.1') {
    console.error('Rifiuto localhost — usare URL Neon produzione.');
    process.exit(1);
}

console.log(`→ host: ${host}`);
process.env.DATABASE_URL = url;

const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main(): Promise<void> {
    await prisma.$executeRawUnsafe(
        `ALTER TABLE "DeceasedProfile" ADD COLUMN IF NOT EXISTS "delivery_photo_urls" TEXT[] DEFAULT ARRAY[]::TEXT[]`
    );
    console.log('SQL_APPLIED');

    const sql = readFileSync(`prisma/migrations/${MIGRATION_NAME}/migration.sql`, 'utf8');
    const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM "_prisma_migrations" WHERE migration_name = $1 LIMIT 1`,
        MIGRATION_NAME
    );
    if (existing.length === 0) {
        const checksum = createHash('sha256').update(sql).digest('hex');
        const id = randomUUID();
        await prisma.$executeRawUnsafe(
            `INSERT INTO "_prisma_migrations"
              (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
             VALUES ($1, $2, NOW(), $3, NULL, NULL, NOW(), 1)`,
            id,
            checksum,
            MIGRATION_NAME
        );
        console.log('MIGRATION_RECORDED', id);
    } else {
        console.log('MIGRATION_ALREADY_RECORDED');
    }

    // Backfill gallery defunto da proof già presenti (es. FT-RC-26-003).
    const proofs = await prisma.deliveryProof.findMany({
        where: { status: 'COMPLETED' },
        select: {
            photosAfterUrls: true,
            photoAfterUrl: true,
            photosBeforeUrls: true,
            photoBeforeUrl: true,
            order: { select: { deceasedProfileId: true, photos: true } },
        },
        take: 500,
    });

    let updated = 0;
    for (const proof of proofs) {
        const deceasedId = proof.order.deceasedProfileId;
        if (!deceasedId) continue;
        const urls = [
            ...(proof.photosBeforeUrls || []),
            ...(proof.photoBeforeUrl ? [proof.photoBeforeUrl] : []),
            ...(proof.photosAfterUrls || []),
            ...(proof.photoAfterUrl ? [proof.photoAfterUrl] : []),
            ...(proof.order.photos || []),
        ]
            .map((u) => u.trim())
            .filter(Boolean);
        if (!urls.length) continue;
        const unique = [...new Set(urls)];
        const profile = await prisma.deceasedProfile.findUnique({
            where: { id: deceasedId },
            select: { deliveryPhotoUrls: true, coverUrl: true },
        });
        if (!profile) continue;
        const merged = [...new Set([...(profile.deliveryPhotoUrls || []), ...unique])];
        await prisma.deceasedProfile.update({
            where: { id: deceasedId },
            data: {
                deliveryPhotoUrls: merged,
                coverUrl: merged.at(-1) || profile.coverUrl,
            },
        });
        updated += 1;
    }
    console.log('BACKFILL_DECEASED', updated);
}

main()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
