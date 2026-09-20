import prisma from '@/lib/prisma';
import { loadCostiSenzaDocumento } from '@/lib/financial/commercialistaCorrispettiviXlsx';
import { resolveQuarterBounds } from '@/lib/financial/taxQuarterly';
import {
    isPrepaidSubscriptionPoseOrder,
    isPrepaidCarnetParentOrder,
} from '@/lib/financial/prepaidSubscriptionOrders';

async function main() {
    const near = await prisma.order.findMany({
        where: {
            deletedAt: null,
            isTest: false,
            OR: [
                {
                    totalPriceCents: 2999,
                    createdAt: { gte: new Date('2026-05-08'), lte: new Date('2026-05-14') },
                },
                { stripeTransactionId: { contains: 'TVvy64' } },
            ],
        },
        select: {
            orderNumber: true,
            totalPriceCents: true,
            createdAt: true,
            stripeTransactionId: true,
            status: true,
        },
    });
    console.log('MAY11_NEAR', JSON.stringify(near));

    const b = resolveQuarterBounds(2026, 2);
    const rows = await loadCostiSenzaDocumento(b.start, b.end);
    let matchComp = 0;
    let matchPrice = 0;
    let matchBankOnly = 0;
    let other = 0;
    const details: unknown[] = [];
    for (const r of rows) {
        if (!r.orderNumber || r.orderNumber === '—' || /^c[a-z0-9]{8,}$/i.test(r.orderNumber)) {
            matchBankOnly++;
            details.push({
                order: r.orderNumber,
                f3: r.amountCents / 100,
                kind: 'bank_or_truncated',
                florist: r.floristName,
            });
            continue;
        }
        const o = await prisma.order.findFirst({
            where: { orderNumber: r.orderNumber },
            select: {
                orderNumber: true,
                totalPriceCents: true,
                floristCompensationCents: true,
                additionalInstructions: true,
                veraWorkflowFlags: true,
                financeNotes: true,
                isRecurring: true,
                deliveryDate: true,
                createdAt: true,
            },
        });
        if (!o) {
            other++;
            details.push({ order: r.orderNumber, f3: r.amountCents / 100, kind: 'order_not_found' });
            continue;
        }
        const comp = o.floristCompensationCents || 0;
        const price = o.totalPriceCents || 0;
        let kind = 'other';
        if (comp > 0 && r.amountCents === comp) {
            matchComp++;
            kind = 'floristCompensation';
        } else if (price > 0 && r.amountCents === price) {
            matchPrice++;
            kind = 'customerTotal';
        } else if (comp > 0 && Math.abs(r.amountCents - comp) <= 1) {
            matchComp++;
            kind = 'floristCompensation~';
        } else {
            other++;
            kind = `mismatch comp=${(comp / 100).toFixed(2)} price=${(price / 100).toFixed(2)}`;
        }
        details.push({
            order: r.orderNumber,
            f3: r.amountCents / 100,
            kind,
            floristCompensation: comp / 100,
            customerTotal: price / 100,
            prepaidPose: isPrepaidSubscriptionPoseOrder(o),
            prepaidParent: isPrepaidCarnetParentOrder(o),
        });
    }
    console.log(
        JSON.stringify(
            {
                matchComp,
                matchPrice,
                matchBankOnly,
                other,
                avgF3: +(rows.reduce((s, r) => s + r.amountCents, 0) / rows.length / 100).toFixed(2),
                details,
            },
            null,
            2
        )
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
