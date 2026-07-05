/**
 * Simulazione Proof of Delivery → WhatsApp nativo VERA (Meta Cloud API).
 *
 * Uso:
 *   npx tsx scripts/simulate-proof-of-delivery.ts FT-CO-26-001 +393331112222
 */
import { loadEnvFiles } from '../lib/loadEnvFiles';

loadEnvFiles();

import prisma from '../lib/prisma';
import { notifyCustomerDeliveryComplete } from '../lib/deliveryProof/notifyCustomerDeliveryComplete';
import { normalizePhoneE164 } from '../lib/whatsapp/metaCloudApiClient';

const orderNumber = process.argv[2]?.trim() || 'FT-CO-26-001';
const phoneOverride = process.argv[3]?.trim() || '';

async function main() {
    console.log('→ Simulazione Proof of Delivery (VERA / Meta Cloud API)');
    console.log(`  Ordine: ${orderNumber}`);
    if (phoneOverride) console.log(`  Telefono override: ${phoneOverride}`);
    console.log('');

    const order = await prisma.order.findFirst({
        where: { orderNumber },
        include: { deliveryProof: true },
    });

    if (!order) {
        console.error('Ordine non trovato.');
        process.exit(1);
    }

    if (phoneOverride) {
        await prisma.order.update({
            where: { id: order.id },
            data: { customerPhone: phoneOverride },
        });
        console.log(`  customerPhone aggiornato a ${normalizePhoneE164(phoneOverride)}`);
    }

    const result = await notifyCustomerDeliveryComplete(order.id);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
