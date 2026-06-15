import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import prisma from '../lib/prisma';

async function testHistoricalCheck() {
    const testEmail = 'staff.floremoria@gmail.com';
    const testPhone = '3204105305';

    console.log(`Checking past orders count for Email: ${testEmail} or Phone: ${testPhone}...`);

    try {
        const pastOrdersCount = await prisma.order.count({
            where: {
                partnerPaymentStatus: 'PAID',
                OR: [
                    { buyerEmail: testEmail },
                    { customerPhone: testPhone },
                ],
            },
        });
        
        console.log(`Found ${pastOrdersCount} past paid orders.`);
    } catch (e) {
        console.error('Database count query failed:', e);
    } finally {
        await prisma.$disconnect();
    }
}

testHistoricalCheck();
