/**
 * Re-invio notifica post-consegna WhatsApp (Punto E) per ordini FT-TO-26-001 / FT-TO-26-002.
 * Esegui: npx tsx scripts/maintenance/resend-ft-to-delivery-whatsapp.ts
 */
import { loadEnvFiles } from '../../lib/loadEnvFiles';
import prisma from '../../lib/prisma';
import { notifyCustomerDeliveryComplete } from '../../lib/deliveryProof/notifyCustomerDeliveryComplete';
import { releaseWorkflowStep } from '../../lib/vera/orderWorkflow/claimWorkflowStep';

loadEnvFiles();

const ORDER_NUMBERS = ['FT-TO-26-001', 'FT-TO-26-002'] as const;

async function main() {
    const orders = await prisma.order.findMany({
        where: { orderNumber: { in: [...ORDER_NUMBERS] }, deletedAt: null },
        include: { deliveryProof: true },
        orderBy: { orderNumber: 'asc' },
    });

    if (orders.length === 0) {
        throw new Error('Ordini FT-TO non trovati.');
    }

    console.log(`Trovati ${orders.length} ordini.\n`);

    for (const order of orders) {
        console.log(`--- ${order.orderNumber} (${order.id}) ---`);
        if (order.deliveryProof?.status !== 'COMPLETED') {
            console.warn('  SKIP: proof non COMPLETED');
            continue;
        }

        await releaseWorkflowStep(order.id, 'puntoEF_delivery');
        const result = await notifyCustomerDeliveryComplete(order.id, { forceResend: true });
        console.log('  Risultato:', JSON.stringify(result));

        if (result.ok && !result.skipped) {
            await prisma.order.update({
                where: { id: order.id },
                data: {
                    veraWorkflowFlags: {
                        ...(typeof order.veraWorkflowFlags === 'object' && order.veraWorkflowFlags
                            ? (order.veraWorkflowFlags as Record<string, unknown>)
                            : {}),
                        puntoEF_delivery: new Date().toISOString(),
                    },
                },
            });
        }
        console.log('');
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
