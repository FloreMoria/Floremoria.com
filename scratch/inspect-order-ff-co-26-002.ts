import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function inspectOrder() {
    console.log('--- ISPEZIONE ORDINE FF-CO-26-002 ---');

    const order = await prisma.order.findFirst({
        where: { orderNumber: 'FF-CO-26-002' },
        include: {
            partner: true,
            user: true,
        },
    });

    if (!order) {
        console.log('Ordine FF-CO-26-002 non trovato.');
        return;
    }

    console.log('Dettagli completi ordine:', {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        partnerId: order.partnerId,
        partnerName: order.partner?.shopName || order.partner?.ownerName,
        partnerPhone: order.partner?.whatsappNumber,
        isFirstOrderForPartner: order.isFirstOrderForPartner,
        veraWorkflowFlags: order.veraWorkflowFlags,
        veraAlertType: order.veraAlertType,
        isTest: order.isTest,
        buyerFullName: order.buyerFullName,
        buyerEmail: order.buyerEmail,
        customerPhone: order.customerPhone,
        cemeteryCity: order.cemeteryCity,
        cemeteryName: order.cemeteryName,
        createdAt: order.createdAt,
    });
}

inspectOrder()
    .catch((e) => console.error(e))
    .finally(() => prisma.$disconnect());
