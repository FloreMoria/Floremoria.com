import prisma from '../lib/prisma';

async function findOrder() {
    try {
        let order = await prisma.order.findFirst({
            where: {
                deliveryProof: { isNot: null }
            },
            orderBy: { createdAt: 'desc' },
            include: { deliveryProof: true }
        });
        
        if (!order) {
            console.log('No order with delivery proof found. Querying most recent order...');
            order = await prisma.order.findFirst({
                orderBy: { createdAt: 'desc' },
                include: { deliveryProof: true }
            });
        }
        
        if (!order) {
            console.log('No orders found in the database.');
            return;
        }

        console.log('--- Order Found ---');
        console.log(`ID: ${order.id}`);
        console.log(`Order Number: ${order.orderNumber}`);
        console.log(`Buyer: ${order.buyerFullName}`);
        console.log(`Email: ${order.buyerEmail}`);
        console.log(`Deceased: ${order.deceasedName}`);
        console.log(`Phone: ${order.customerPhone}`);
        console.log(`Photo Url: ${order.deliveryProof?.photoAfterUrl || 'None'}`);
    } catch (e) {
        console.error('Database query failed:', e);
    } finally {
        await prisma.$disconnect();
    }
}

findOrder();
