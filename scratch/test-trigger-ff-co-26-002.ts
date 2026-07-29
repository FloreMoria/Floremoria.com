import { PrismaClient } from '@prisma/client';
import { onOrderStatusChanged } from '../lib/orders/orderStatusFilter';
import { notifyFloristDeliveryLinkForOrder } from '../lib/orders/notifyFloristDeliveryLink';

const prisma = new PrismaClient();

async function testTrigger() {
    console.log('--- TEST TRIGGER NOTIFICA ORDINE FF-CO-26-002 ---');

    const order = await prisma.order.findFirst({
        where: { orderNumber: 'FF-CO-26-002' },
    });

    if (!order) {
        console.log('Ordine non trovato!');
        return;
    }

    console.log('Esecuzione onOrderStatusChanged per ordine', order.id, 'con status:', order.status);

    const result = await notifyFloristDeliveryLinkForOrder(order.id, { bypassWindow: true, force: true });
    console.log('Risultato notifyFloristDeliveryLinkForOrder:', result);

    const statusResult = await onOrderStatusChanged(order.id, order.status);
    console.log('Risultato onOrderStatusChanged:', statusResult);
}

testTrigger()
    .catch((e) => console.error(e))
    .finally(() => prisma.$disconnect());
