const { PrismaClient } = require('@prisma/client');
const { visibleDashboardOrdersWhere, ordersListPageWhere } = require('../lib/dashboardOrdersFilter');

const prisma = new PrismaClient();

async function run() {
    try {
        const testModeActive = false;
        
        const filter1 = visibleDashboardOrdersWhere(testModeActive);
        const filter2 = ordersListPageWhere(testModeActive);

        const orders1 = await prisma.order.findMany({
            where: {
                ...filter1,
                orderNumber: 'FT-PA-26-006'
            }
        });

        const orders2 = await prisma.order.findMany({
            where: {
                ...filter2,
                orderNumber: 'FT-PA-26-006'
            }
        });

        console.log('visibleDashboardOrdersWhere count:', orders1.length);
        console.log('ordersListPageWhere count:', orders2.length);
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

run();
