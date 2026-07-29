import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkOrder() {
    try {
        const order = await prisma.order.findFirst({
            where: {
                orderNumber: 'FT-PA-26-006'
            },
            include: {
                items: true
            }
        });

        console.log('--- ORDINE TROVATO ---');
        console.log(JSON.stringify(order, null, 2));
    } catch (error) {
        console.error('Errore durante la query:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkOrder();
