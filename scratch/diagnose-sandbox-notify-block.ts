/**
 * Diagnosi read-only: ultimi ordini test + flag workflow + perché Meta non parte.
 * npx tsx scratch/diagnose-sandbox-notify-block.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { PrismaClient } from '@prisma/client';
import {
    getWhatsAppNotifyEnvDiagnostics,
    isWhatsAppAutoNotifyDisabledForOrder,
    shouldSkipTestOrderMetaSend,
} from '../lib/whatsapp/outboundGuards';
import { isWithinFloristNotifyWindow } from '../lib/datetime/floristNotifyWindow';
import { parseWorkflowFlags, isWorkflowStepDone } from '../lib/vera/orderWorkflow/types';

const prisma = new PrismaClient();

async function main() {
    console.log('=== ENV (da .env.local locale — NON è Vercel) ===');
    console.log(getWhatsAppNotifyEnvDiagnostics());
    console.log('ALLOW_TEST raw:', process.env.WHATSAPP_ALLOW_TEST_SENDS);
    console.log('AUTO_NOTIFY raw:', process.env.WHATSAPP_AUTO_NOTIFY_DISABLED);
    console.log('OUTBOUND raw:', process.env.WHATSAPP_OUTBOUND_DISABLED);
    console.log('Meta configured:', Boolean(process.env.WHATSAPP_CLOUD_API_KEY && process.env.WHATSAPP_PHONE_NUMBER_ID));
    console.log('Florist window now:', isWithinFloristNotifyWindow());

    const orders = await prisma.order.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
            id: true,
            orderNumber: true,
            createdAt: true,
            status: true,
            isTest: true,
            partnerId: true,
            customerPhone: true,
            veraWorkflowFlags: true,
            veraAlertType: true,
            veraAlertMessage: true,
            partner: {
                select: {
                    shopName: true,
                    ownerName: true,
                    whatsappNumber: true,
                    deletedAt: true,
                },
            },
        },
    });

    console.log('\n=== Ultimi 8 ordini ===');
    for (const o of orders) {
        const flags = parseWorkflowFlags(o.veraWorkflowFlags);
        const block = {
            autoNotifyDisabledForOrder: isWhatsAppAutoNotifyDisabledForOrder(o.isTest),
            testMetaSkipped: shouldSkipTestOrderMetaSend(o.isTest),
            puntoADone: isWorkflowStepDone(flags, 'puntoA_florist'),
            puntoBDone: isWorkflowStepDone(flags, 'puntoB_customer'),
            puntoBScheduled: flags.puntoB_customer_scheduled || null,
            puntoADeferred: flags.puntoA_florist_deferred || null,
            noPartner: !o.partnerId || Boolean(o.partner?.deletedAt),
            noFloristWa: !o.partner?.whatsappNumber?.trim(),
            noCustomerPhone: !o.customerPhone?.trim(),
        };
        console.log(
            JSON.stringify(
                {
                    orderNumber: o.orderNumber,
                    createdAt: o.createdAt.toISOString(),
                    status: o.status,
                    isTest: o.isTest,
                    florist: o.partner?.ownerName || o.partner?.shopName || null,
                    floristWa: o.partner?.whatsappNumber || null,
                    customerPhone: o.customerPhone,
                    alert: o.veraAlertType,
                    alertMsg: o.veraAlertMessage?.slice(0, 120),
                    flags,
                    block,
                },
                null,
                2
            )
        );
    }

    // Sessioni chat aggiornate oggi con outbound
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const msgs = await prisma.whatsAppChatMessage.findMany({
        where: { createdAt: { gte: since }, direction: 'OUTBOUND' },
        orderBy: { createdAt: 'desc' },
        take: 15,
        select: {
            createdAt: true,
            body: true,
            metadata: true,
            session: { select: { phone: true, name: true, isTest: true } },
        },
    });
    console.log('\n=== Outbound chat oggi (max 15) ===');
    for (const m of msgs) {
        const meta = m.metadata && typeof m.metadata === 'object' ? m.metadata : {};
        console.log(
            m.createdAt.toISOString(),
            m.session.name,
            m.session.isTest ? 'TEST' : 'REAL',
            JSON.stringify(meta).slice(0, 120),
            (m.body || '').replace(/\n/g, ' ').slice(0, 80)
        );
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
