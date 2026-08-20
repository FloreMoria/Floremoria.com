import prisma from '../lib/prisma';

async function main() {
    console.log('🔄 Esecuzione migration schema per campi merge (deleted_at, merged_into_id)...');

    try {
        await prisma.$executeRawUnsafe(`ALTER TABLE "DeceasedProfile" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "DeceasedProfile" ADD COLUMN IF NOT EXISTS "merged_into_id" TEXT;`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "merged_into_id" TEXT;`);
        console.log('✅ Tabelle aggiornate con successo su Neon PG!');
    } catch (err) {
        console.error('❌ Errore durante l\'esecuzione SQL:', err);
    } finally {
        await prisma.$disconnect();
    }
}

main();
