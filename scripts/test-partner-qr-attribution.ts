/**
 * Test attribuzione fee QR Art. 2.3 (simulazione webhook) su Neon branch.
 * Uso: TOKEN_A=... TOKEN_B=... npx tsx scripts/test-partner-qr-attribution.ts
 */
import { PrismaClient } from '@prisma/client';
import {
    applyPartnerQrReferralOnPaid,
    mergePartnerQrSessionFlag,
} from '../lib/floristNetwork/applyPartnerQrReferral';

async function main() {
    const TOKEN_A = process.env.TOKEN_A?.trim();
    const TOKEN_B = process.env.TOKEN_B?.trim();
    if (!TOKEN_A || !TOKEN_B) {
        throw new Error('TOKEN_A e TOKEN_B obbligatori');
    }

    const p = new PrismaClient();
    try {
        const leader = await p.partner.findFirst({ where: { slug: 'test-leader' } });
        const partnerB = await p.partner.findFirst({ where: { slug: 'test-partner-b' } });
        if (!leader || !partnerB) throw new Error('Partner test mancanti sul branch Neon');

        async function makeOrder(label: string, token: string | null) {
            return p.order.create({
                data: {
                    deceasedName: `TEST QR ${label}`,
                    cemeteryName: 'TEST',
                    cemeteryCity: 'PN',
                    totalPriceCents: 3999,
                    status: 'PENDING',
                    isTest: true,
                    ...(token
                        ? { veraWorkflowFlags: mergePartnerQrSessionFlag(null, token) }
                        : {}),
                },
            });
        }

        const results: Record<string, unknown> = {};

        const o1 = await makeOrder('T1', TOKEN_A);
        const r1 = await applyPartnerQrReferralOnPaid({
            orderId: o1.id,
            sessionToken: TOKEN_A,
        });
        const o1b = await p.order.findUnique({
            where: { id: o1.id },
            select: {
                referralFeeCents: true,
                referralFloristId: true,
                referralScanEventId: true,
                referralPartnerId: true,
            },
        });
        results.t1 = {
            apply: r1,
            order: o1b,
            feeIs500: o1b?.referralFeeCents === 500,
            floristIsLeader: o1b?.referralFloristId === leader.id,
            legacyUntouched: o1b?.referralPartnerId == null,
        };

        const o2 = await makeOrder('T2', TOKEN_A);
        const r2 = await applyPartnerQrReferralOnPaid({
            orderId: o2.id,
            sessionToken: TOKEN_A,
        });
        const o2b = await p.order.findUnique({
            where: { id: o2.id },
            select: {
                referralFeeCents: true,
                referralScanEventId: true,
                referralFloristId: true,
            },
        });
        results.t2 = {
            apply: r2,
            order: o2b,
            noFee: (o2b?.referralFeeCents ?? 0) === 0 && !o2b?.referralScanEventId,
        };

        const o3 = await makeOrder('T3', null);
        const r3 = await applyPartnerQrReferralOnPaid({
            orderId: o3.id,
            sessionToken: null,
        });
        const o3b = await p.order.findUnique({
            where: { id: o3.id },
            select: { referralFeeCents: true, referralScanEventId: true },
        });
        results.t3 = {
            apply: r3,
            order: o3b,
            noFee: (o3b?.referralFeeCents ?? 0) === 0 && !o3b?.referralScanEventId,
        };

        const o5 = await makeOrder('T5', TOKEN_B);
        const r5 = await applyPartnerQrReferralOnPaid({
            orderId: o5.id,
            sessionToken: TOKEN_B,
        });
        const o5b = await p.order.findUnique({
            where: { id: o5.id },
            select: { referralFeeCents: true, referralFloristId: true },
        });
        results.t5 = {
            apply: r5,
            order: o5b,
            feeToB: o5b?.referralFloristId === partnerB.id && o5b?.referralFeeCents === 500,
        };

        await p.order.deleteMany({
            where: { id: { in: [o1.id, o2.id, o3.id, o5.id] } },
        });
        await p.floristScanEvent.deleteMany({
            where: { sessionToken: { in: [TOKEN_A, TOKEN_B] } },
        });

        console.log(JSON.stringify(results, null, 2));
    } finally {
        await p.$disconnect();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
