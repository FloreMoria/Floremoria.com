import { PrismaClient } from '@prisma/client';
import { loadEnvFiles } from '../lib/loadEnvFiles';

loadEnvFiles();

async function main() {
    const orderNumber = process.argv[2]?.trim() || 'FT-MB-26-001';
    const url =
        process.env.DATABASE_URL_UNPOOLED?.trim() ||
        process.env.DATABASE_URL?.trim();
    if (!url) {
        console.error('Manca DATABASE_URL');
        process.exit(1);
    }
    const prisma = new PrismaClient({ datasources: { db: { url } } });
    const o = await prisma.order.findFirst({
        where: { orderNumber },
        select: {
            id: true,
            status: true,
            orderNumber: true,
            gravePosition: true,
            cemeteryName: true,
            cemeteryCity: true,
            veraWorkflowFlags: true,
            veraAlertType: true,
            veraAlertMessage: true,
            orderFrozenAt: true,
            isFirstOrderForPartner: true,
            partner: { select: { shopName: true, whatsappNumber: true } },
        },
    });
    console.log(JSON.stringify(o, null, 2));
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
