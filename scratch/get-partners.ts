import { loadEnvFiles } from '../lib/loadEnvFiles';
loadEnvFiles();

import { PrismaClient } from '@prisma/client';

async function main() {
    const prisma = new PrismaClient();
    try {
        console.log('📋 Lettura tabella Partner via SQL diretta...');
        const partners: any[] = await prisma.$queryRawUnsafe(
            `SELECT id, "ownerName", "shopName", "uniqueCode" FROM "Partner"`
        );
        
        console.log(`Trovati ${partners.length} partner:`);
        for (const p of partners) {
            console.log(`\n👤 Partner ID: "${p.id}"`);
            console.log(`   Owner: ${p.ownerName} | Shop: ${p.shopName}`);
            console.log(`   Unique Code: ${p.uniqueCode || '(nessuno)'}`);
            
            // Recuperiamo le credenziali API per questo partner
            const credentials: any[] = await prisma.$queryRawUnsafe(
                `SELECT id, "label", "public_id" as "publicId", "is_active" as "isActive" FROM "partner_api_credentials" WHERE partner_id = $1`,
                p.id
            );
            console.log(`   Credenziali API (${credentials.length}):`);
            credentials.forEach((c) => {
                console.log(`     - Public ID: "${c.publicId}"`);
                console.log(`       Label: "${c.label}"`);
                console.log(`       Is Active: ${c.isActive}`);
            });
        }
    } catch (err) {
        console.error('Errore durante la query:', err);
    } finally {
        await prisma.$disconnect();
    }
}

main();
