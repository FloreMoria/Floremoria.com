import prisma from '../lib/prisma';

async function main() {
    console.log('--- RECENT ORDERS DIAGNOSTICS ---');
    const recentOrders = await prisma.order.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
            deliveryProof: true,
        }
    });

    for (const order of recentOrders) {
        console.log(`Order Number: ${order.orderNumber}`);
        console.log(`ID: ${order.id}`);
        console.log(`Status: ${order.status}`);
        console.log(`isTest: ${order.isTest}`);
        console.log(`Created At: ${order.createdAt.toISOString()}`);
        console.log(`Customer Phone: ${order.customerPhone}`);
        console.log(`Buyer Email: ${order.buyerEmail}`);
        console.log(`Partner ID: ${order.partnerId}`);
        console.log(`Agency Name: ${order.agencyName}`);
        console.log(`Workflow Flags: ${JSON.stringify(order.veraWorkflowFlags)}`);
        console.log(`Alert Type: ${order.veraAlertType}`);
        console.log(`Alert Message: ${order.veraAlertMessage}`);
        console.log(`PoD Status: ${order.deliveryProof?.status || 'N/A'}`);
        console.log(`PoD photoAfterUrl: ${order.deliveryProof?.photoAfterUrl || 'N/A'}`);
        console.log('---------------------------------');
    }
}

main().catch(console.error);
