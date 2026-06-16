import { loadEnvFiles } from '../lib/loadEnvFiles';
loadEnvFiles();

import { PrismaClient } from '@prisma/client';
import { GET } from '../app/api/v1/partner/orders/route';
import {
    generatePartnerApiPublicId,
    generatePartnerApiSecretPlain,
    hashPartnerApiSecret
} from '../lib/partnerApiSecret';

async function testEndpoint() {
    console.log('🚀 Avvio unit-test per il nuovo endpoint API Partner...');
    const prisma = new PrismaClient();
    let tempCredential: any = null;

    try {
        // 1. Recuperiamo il primo partner disponibile via SQL diretta
        const partners: any[] = await prisma.$queryRawUnsafe(
            `SELECT id, "shopName" FROM "Partner" LIMIT 1`
        );
        const partner = partners[0];
        if (!partner) {
            console.error('❌ Nessun partner trovato nel database! Esegui prima i seed.');
            return;
        }
        console.log(`👤 Utilizzo partner: ${partner.shopName} (${partner.id})`);

        // 2. Creiamo una credenziale temporanea per il test via SQL diretta
        const publicId = generatePartnerApiPublicId();
        const secretPlain = generatePartnerApiSecretPlain();
        const secretHash = hashPartnerApiSecret(secretPlain);
        const tempId = `c-temp-test-id-${Date.now()}`;

        console.log(`🔑 Generazione credenziali temporanee:`);
        console.log(`   Public ID: ${publicId}`);
        console.log(`   Secret Plain: ${secretPlain}`);

        await prisma.$executeRawUnsafe(
            `INSERT INTO "partner_api_credentials" (id, partner_id, label, public_id, secret_hash, is_active, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            tempId,
            partner.id,
            'Temp Test Credential',
            publicId,
            secretHash,
            true
        );
        tempCredential = { id: tempId };
        console.log('✅ Credenziali registrate a database via SQL.');

        // 3. Prepariamo la richiesta mockata per GET /api/v1/partner/orders
        console.log('\n📤 Simulazione richiesta GET /api/v1/partner/orders...');
        const reqUrl = 'http://localhost/api/v1/partner/orders?limit=2';
        const req = new Request(reqUrl, {
            method: 'GET',
            headers: {
                'X-Partner-Key': publicId,
                'Authorization': `Bearer ${secretPlain}`
            }
        });

        // 4. Invochiamo l'handler della route
        const res = await GET(req);
        console.log(`--- RISPOSTA HTTP: ${res.status} ---`);
        
        const data = await res.json();
        console.log('Body:', JSON.stringify(data, null, 2));

        if (res.status === 200) {
            console.log('✅ Test passato! L\'endpoint risponde correttamente con 200.');
        } else {
            console.error(`❌ Test fallito! Stato inatteso: ${res.status}`);
        }

    } catch (error) {
        console.error('❌ Errore durante l\'esecuzione del test:', error);
    } finally {
        // 5. Pulizia delle credenziali temporanee per non sporcare il DB
        if (tempCredential) {
            console.log('\n🧹 Rimozione credenziali di test temporanee...');
            await prisma.$executeRawUnsafe(
                `DELETE FROM "partner_api_credentials" WHERE id = $1`,
                tempCredential.id
            );
            console.log('✅ Database ripristinato.');
        }
        await prisma.$disconnect();
    }
}

testEndpoint();
