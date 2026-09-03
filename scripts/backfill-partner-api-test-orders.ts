/**
 * Backfill isTest su ordini API partner creati prima del flag automatico (chiave fmp_test_…).
 * Esegui: npx tsx scripts/backfill-partner-api-test-orders.ts
 *         npx tsx scripts/backfill-partner-api-test-orders.ts --apply
 */

import prisma from '@/lib/prisma';
import {
    buildPartnerTestFinanceNote,
    resolvePartnerApiPaymentKind,
} from '@/lib/partnerTestCredential';

const APPLY = process.argv.includes('--apply');

async function main(): Promise<void> {
    const testCredentials = await prisma.partnerApiCredential.findMany({
        where: { publicId: { startsWith: 'fmp_test_' }, isActive: true },
        select: { publicId: true, partnerId: true },
    });

    if (!testCredentials.length) {
        console.log('Nessuna credenziale fmp_test_ attiva trovata.');
        return;
    }

    const partnerIds = [...new Set(testCredentials.map((c) => c.partnerId))];
    const candidates = await prisma.order.findMany({
        where: {
            isTest: false,
            OR: [
                {
                    AND: [
                        {
                            OR: [
                                { referralPartnerId: { in: partnerIds } },
                                { agencyId: { in: partnerIds } },
                            ],
                        },
                        { orderNumber: { startsWith: 'PT-' } },
                    ],
                },
                { deceasedName: { contains: 'Pavani', mode: 'insensitive' } },
            ],
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
            id: true,
            orderNumber: true,
            deceasedName: true,
            status: true,
            partnerPaymentStatus: true,
            paymentMethodLabel: true,
            createdAt: true,
            financeNotes: true,
        },
    });

    console.log(`Trovati ${candidates.length} ordini PT- candidati (partner test, isTest=false).`);
    for (const o of candidates) {
        console.log(
            `- ${o.orderNumber} | ${o.deceasedName} | ${o.status} | pay=${o.partnerPaymentStatus} | ${o.createdAt.toISOString()}`
        );
    }

    if (!APPLY) {
        console.log('\nDry-run. Ripeti con --apply per aggiornare isTest=true.');
        return;
    }

    const publicId = testCredentials[0]!.publicId;
    const updated = await prisma.order.updateMany({
        where: { id: { in: candidates.map((c) => c.id) } },
        data: {
            isTest: true,
            partnerId: null,
            status: 'ACCEPTED',
            partnerPaymentStatus: 'PAID',
            paymentMethodLabel: resolvePartnerApiPaymentKind(true),
            financeNotes: buildPartnerTestFinanceNote(publicId),
        },
    });

    console.log(`Aggiornati ${updated.count} ordini → isTest=true (sandbox API).`);
}

main()
    .catch((err) => {
        console.error('[backfill-partner-api-test-orders] FAILED:', err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
