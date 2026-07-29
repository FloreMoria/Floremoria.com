/**
 * Riproduce Punto B/A su FT-MI-26-002 e stampa il risultato grezzo (niente mock).
 * ATTENZIONE: può inviare WhatsApp reali al numero test.
 * npx tsx scratch/repro-ft-mi-notify.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { PrismaClient } from '@prisma/client';
import { runVeraPostPaymentWorkflowWithResults } from '../lib/vera/orderWorkflow';

const prisma = new PrismaClient();

async function main() {
    const order = await prisma.order.findFirst({
        where: { orderNumber: 'FT-MI-26-002', deletedAt: null },
        select: { id: true, orderNumber: true, isTest: true, veraWorkflowFlags: true },
    });
    if (!order) throw new Error('FT-MI-26-002 non trovato');

    console.log('BEFORE flags:', order.veraWorkflowFlags);
    console.log('ENV', {
        ALLOW: process.env.WHATSAPP_ALLOW_TEST_SENDS,
        AUTO: process.env.WHATSAPP_AUTO_NOTIFY_DISABLED,
        OUT: process.env.WHATSAPP_OUTBOUND_DISABLED,
        PHONE_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
        HAS_KEY: Boolean(process.env.WHATSAPP_CLOUD_API_KEY),
    });

    const result = await runVeraPostPaymentWorkflowWithResults(order.id);
    console.log('WORKFLOW RESULT:', JSON.stringify(result, null, 2));

    const after = await prisma.order.findFirst({
        where: { id: order.id },
        select: { veraWorkflowFlags: true, veraAlertType: true, veraAlertMessage: true },
    });
    console.log('AFTER flags:', after?.veraWorkflowFlags);
    console.log('AFTER alert:', after?.veraAlertType, after?.veraAlertMessage?.slice(0, 200));
}

main()
    .catch((e) => {
        console.error('FATAL', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
