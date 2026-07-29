/**
 * Sblocca ordine bloccato su alert tomba + reinizia Punto A (force).
 * Uso: npx tsx scratch/unblock-punto-a.ts FT-MB-26-001
 */
import { PrismaClient } from '@prisma/client';
import { loadEnvFiles } from '../lib/loadEnvFiles';
import { clearVeraOperationalAlert } from '../lib/vera/operationalAlerts';
import { releaseWorkflowStep } from '../lib/vera/orderWorkflow/claimWorkflowStep';
import { runPuntoAFloristNewOrder } from '../lib/vera/orderWorkflow/puntoAFloristNewOrder';

loadEnvFiles();

async function main() {
    const orderNumber = process.argv[2]?.trim();
    if (!orderNumber) {
        console.error('Uso: npx tsx scratch/unblock-punto-a.ts <ORDER_NUMBER>');
        process.exit(1);
    }

    const url =
        process.env.DATABASE_URL_UNPOOLED?.trim() || process.env.DATABASE_URL?.trim();
    if (!url) {
        console.error('Manca DATABASE_URL');
        process.exit(1);
    }

    process.env.DATABASE_URL = url;
    const prisma = new PrismaClient({ datasources: { db: { url } } });

    const order = await prisma.order.findFirst({
        where: { orderNumber, deletedAt: null },
        select: {
            id: true,
            orderNumber: true,
            status: true,
            gravePosition: true,
            veraAlertType: true,
            veraWorkflowFlags: true,
            partner: { select: { shopName: true, whatsappNumber: true } },
        },
    });

    if (!order) {
        console.error(`Ordine ${orderNumber} non trovato`);
        process.exit(1);
    }

    console.log('Prima:', JSON.stringify(order, null, 2));

    await releaseWorkflowStep(order.id, 'puntoA_florist');
    await clearVeraOperationalAlert(order.id);

    const result = await runPuntoAFloristNewOrder(order.id, { force: true });
    console.log('Punto A result:', result);

    const after = await prisma.order.findUnique({
        where: { id: order.id },
        select: {
            gravePosition: true,
            veraAlertType: true,
            veraAlertMessage: true,
            veraWorkflowFlags: true,
            status: true,
        },
    });
    console.log('Dopo:', JSON.stringify(after, null, 2));

    await prisma.$disconnect();
    process.exit(result.ok ? 0 : 1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
