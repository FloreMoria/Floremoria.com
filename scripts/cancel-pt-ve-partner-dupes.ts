/**
 * Annulla ordini sandbox duplicati PT-VE-26-005 / PT-VE-26-006 (retry partner dopo timeout).
 * Assumption: PT-VE-26-004 è il master da conservare.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();
if (process.env.DATABASE_URL_UNPOOLED) {
    process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
}

import prisma from '../lib/prisma';

const TO_CANCEL = ['PT-VE-26-005', 'PT-VE-26-006'] as const;

async function main() {
    const reason =
        'Annullato: duplicato sandbox da retry API partner (stesso PaymentIntent / timeout). Master: PT-VE-26-004.';

    const updated = await prisma.order.updateMany({
        where: {
            orderNumber: { in: [...TO_CANCEL] },
            deletedAt: null,
            status: { not: 'CANCELLED' },
        },
        data: {
            status: 'CANCELLED',
            orderFrozenAt: new Date(),
            orderFrozenReason: reason,
            financeNotes: reason,
        },
    });

    const rows = await prisma.order.findMany({
        where: { orderNumber: { in: ['PT-VE-26-004', ...TO_CANCEL] } },
        select: {
            orderNumber: true,
            status: true,
            isTest: true,
            orderFrozenReason: true,
            updatedAt: true,
        },
        orderBy: { orderNumber: 'asc' },
    });

    console.info(
        JSON.stringify(
            {
                cancelledCount: updated.count,
                orders: rows,
            },
            null,
            2
        )
    );
}

main()
    .then(async () => {
        await prisma.$disconnect();
        process.exit(0);
    })
    .catch(async (err) => {
        console.error('[cancel-pt-ve-dupes]', err);
        await prisma.$disconnect();
        process.exit(1);
    });
