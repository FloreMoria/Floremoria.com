import { PrismaClient } from '@prisma/client';
import { loadEnvFiles } from '../lib/loadEnvFiles';
import { resolveProductionDatabaseUrl } from '../lib/database/resolveProductionDatabaseUrl';
import { resendVeraOrderNotifications } from '../lib/vera/orderWorkflow/resendVeraOrderNotifications';

loadEnvFiles();

const orderNumber = process.argv[2]?.trim() || 'FT-MI-26-002';
const doResend = process.argv.includes('--resend');

async function main() {
    const prodUrl = resolveProductionDatabaseUrl();
    const localUrl = process.env.DATABASE_URL?.trim();
    const url = prodUrl || localUrl;
    if (!url) {
        console.error('Nessun DATABASE_URL disponibile.');
        process.exit(1);
    }

    const host = url.match(/@([^/:?]+)/)?.[1] ?? '?';
    console.log(`DB host: ${host}`);

    const prisma = new PrismaClient({ datasources: { db: { url } } });
    const order = await prisma.order.findFirst({
        where: { orderNumber },
        include: {
            partner: { select: { shopName: true, whatsappNumber: true, ownerName: true } },
            user: { select: { phone: true, email: true, name: true } },
        },
    });

    if (!order) {
        console.log(`Ordine ${orderNumber} non trovato.`);
        await prisma.$disconnect();
        process.exit(1);
    }

    console.log(
        JSON.stringify(
            {
                id: order.id,
                status: order.status,
                partnerPaymentStatus: order.partnerPaymentStatus,
                isTest: order.isTest,
                customerPhone: order.customerPhone,
                gravePosition: order.gravePosition,
                cemetery: [order.cemeteryName, order.cemeteryCity].filter(Boolean).join(', '),
                veraWorkflowFlags: order.veraWorkflowFlags,
                veraAlertType: order.veraAlertType,
                veraAlertMessage: order.veraAlertMessage,
                isFirstOrderForPartner: order.isFirstOrderForPartner,
                partnerWhatsapp: order.partner?.whatsappNumber,
                partnerName: order.partner?.shopName,
                userPhone: order.user?.phone,
            },
            null,
            2
        )
    );

    await prisma.$disconnect();

    if (doResend) {
        console.log('\n--- Resend VERA ---');
        const result = await resendVeraOrderNotifications(orderNumber, {
            customer: true,
            florist: true,
            force: true,
        });
        console.log(JSON.stringify(result, null, 2));
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
