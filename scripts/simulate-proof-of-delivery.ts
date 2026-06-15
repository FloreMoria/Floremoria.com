/**
 * Simulazione Proof of Delivery → WhatsApp via Futuria API v2.
 *
 * Uso:
 *   npx tsx scripts/simulate-proof-of-delivery.ts FT-CO-26-001 +393204105305
 *
 * Opzionale: DATABASE_URL per puntare a Neon prod.
 */
import { loadEnvFiles } from '../lib/loadEnvFiles';

loadEnvFiles();

import prisma from '../lib/prisma';
import {
    findFuturiaDuplicateContact,
    normalizeFuturiaPhone,
    prepareDeceasedCustomFieldsForUpsert,
} from '../lib/futuria/client';
import { sendProofOfDeliveryNotification } from '../lib/futuria/proofOfDelivery';

const orderNumber = process.argv[2]?.trim() || 'FT-CO-26-001';
const phoneOverride = process.argv[3]?.trim() || '+393204105305';
const previewContactsOnly = process.argv.includes('--preview-contacts');

async function main() {
    console.log(`→ Simulazione Proof of Delivery`);
    console.log(`  Ordine: ${orderNumber}`);
    console.log(`  Telefono override: ${phoneOverride}`);
    console.log(`  Futuria configurato: ${Boolean(process.env.FUTURIA_API_KEY && process.env.FUTURIA_LOCATION_ID)}`);
    console.log(`  Template PoD: ${process.env.FUTURIA_WHATSAPP_PROOF_TEMPLATE_ID || '(non impostato — serve fuori 24h)'}`);
    console.log('');
    console.log('  ⚠ Il numero +39 320 410 5305 è la LINEA BUSINESS WhatsApp.');
    console.log('    Per testare, usa un cellulare PERSONALE diverso, es: +39333xxxxxxx');
    console.log('');

    let order = await prisma.order.findFirst({
        where: { orderNumber },
        include: { deliveryProof: true },
    });

    if (!order) {
        console.warn(`⚠ Ordine ${orderNumber} non trovato nel DB (${process.env.DATABASE_URL?.slice(0, 40)}...).`);
        console.warn('  Uso payload di simulazione minimo per test Futuria.\n');
    }

    const photoAfterUrl =
        order?.deliveryProof?.photoAfterUrl ||
        '/images/products/fiori-sulle-tombe/bouquet-omaggio-speciale/bouquet-omaggio-speciale-fiori-sulle-tombe-servizio-professionale-FT.webp';

    const deceasedName = order?.deceasedName || 'Santo Sancono';

    const phone = normalizeFuturiaPhone(phoneOverride);
    if (phone) {
        const existing = await findFuturiaDuplicateContact({ phone });
        const customFields = await prepareDeceasedCustomFieldsForUpsert(
            existing?.customFields,
            deceasedName
        );
        console.log('--- Payload customFields (append defunti) ---');
        console.log(JSON.stringify(customFields, null, 2));
        console.log('');
        if (previewContactsOnly) {
            console.log('Modalità --preview-contacts: invio WhatsApp saltato.');
            return;
        }
    }

    const result = await sendProofOfDeliveryNotification({
        orderId: order?.id || `sim-${orderNumber}`,
        orderNumber,
        buyerFullName: order?.buyerFullName || 'Salvatore Marsiglione',
        buyerEmail: order?.buyerEmail || undefined,
        customerPhone: phoneOverride,
        deceasedName,
        cemeteryCity: order?.cemeteryCity || 'Reggio Calabria',
        cemeteryName: order?.cemeteryName,
        deliveryProvince: order?.deliveryProvince,
        photoAfterUrl,
    });

    console.log('--- Esito ---');
    console.log(JSON.stringify(result, null, 2));

    if (!result.ok) {
        process.exit(1);
    }
}

main()
    .catch((err) => {
        console.error('Errore simulazione:', err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
