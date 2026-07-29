import { config } from 'dotenv';
config({ path: '.env.local' });

import { PrismaClient } from '@prisma/client';
import { hasRecentStaffFloristAgreement } from '../lib/vera/staffFloristAgreement';
import { normalizePhoneE164, isMetaCloudConfigured } from '../lib/whatsapp/metaCloudApiClient';
import {
    shouldSkipTestOrderMetaSend,
    isWhatsAppAutoNotifyDisabledForOrder,
} from '../lib/whatsapp/outboundGuards';
import { isWithinFloristNotifyWindow } from '../lib/datetime/floristNotifyWindow';
import { parseWorkflowFlags, isWorkflowStepDone } from '../lib/vera/orderWorkflow/types';

const prisma = new PrismaClient();

async function main() {
    const order = await prisma.order.findFirst({
        where: { orderNumber: 'FT-MI-26-002', deletedAt: null },
        select: {
            id: true,
            orderNumber: true,
            isTest: true,
            status: true,
            partnerId: true,
            customerPhone: true,
            veraWorkflowFlags: true,
            createdAt: true,
            partner: {
                select: {
                    whatsappNumber: true,
                    shopName: true,
                    ownerName: true,
                    deletedAt: true,
                },
            },
        },
    });
    console.log(JSON.stringify(order, null, 2));
    if (!order) return;

    const flags = parseWorkflowFlags(order.veraWorkflowFlags);
    const floristWa = order.partner?.whatsappNumber;
    console.log(
        JSON.stringify(
            {
                createdAt: order.createdAt,
                customerE164: normalizePhoneE164(order.customerPhone),
                floristE164: normalizePhoneE164(floristWa),
                agreed72h: await hasRecentStaffFloristAgreement({
                    partnerWhatsApp: floristWa,
                    orderNumber: order.orderNumber,
                    withinHours: 72,
                }),
                autoNotifyOff: isWhatsAppAutoNotifyDisabledForOrder(order.isTest),
                skipTestMeta: shouldSkipTestOrderMetaSend(order.isTest),
                metaOk: isMetaCloudConfigured(),
                window: isWithinFloristNotifyWindow(),
                puntoADone: isWorkflowStepDone(flags, 'puntoA_florist'),
                puntoBDone: isWorkflowStepDone(flags, 'puntoB_customer'),
                ALLOW: process.env.WHATSAPP_ALLOW_TEST_SENDS,
            },
            null,
            2
        )
    );
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
