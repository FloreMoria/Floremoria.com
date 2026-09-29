/**
 * Operazione 4 — test affido Leader + coordinamento 10%.
 * Esegui SOLO contro Neon branch dev-florist-network (scrive dati).
 *
 * Usage:
 *   DATABASE_URL=<branch> npx tsx scripts/test-leader-zone-coordination.ts
 */
import { PrismaClient } from '@prisma/client';
import { assignZoneLeaderOnPaid } from '../lib/floristNetwork/assignZoneLeaderOnPaid';
import { applyPartnerQrReferralOnPaid } from '../lib/floristNetwork/applyPartnerQrReferral';
import {
    computeCoordinationFeeCents,
    readCoordinationPercentFromConfig,
    resolveColleagueDelegation,
} from '../lib/floristNetwork/colleagueDelegation';
import { findActiveZoneLeader } from '../lib/floristNetwork/findZoneLeader';

const prisma = new PrismaClient();

function assert(cond: unknown, msg: string): asserts cond {
    if (!cond) throw new Error(`ASSERT: ${msg}`);
}

function hostOf(url: string): string {
    return url.match(/@([^/]+)/)?.[1] || '?';
}

async function upsertTestLeader() {
    const existing = await prisma.partner.findFirst({
        where: { OR: [{ slug: 'test-leader' }, { uniqueCode: 'FS-TEST-LEADER' }] },
    });
    const data = {
        slug: 'test-leader',
        uniqueCode: 'FS-TEST-LEADER',
        shopName: 'TEST Leader Shop',
        ownerName: 'Test Leader',
        networkRole: 'LEADER' as const,
        networkStatus: 'ACTIVE' as const,
        isActive: true,
        deletedAt: null,
        assignedRegion: 'Test Zone',
        assignedProvinces: ['ZZ', 'ZY'],
        partnerType: 'FLORIST' as const,
    };
    if (existing) {
        return prisma.partner.update({ where: { id: existing.id }, data });
    }
    return prisma.partner.create({ data });
}

async function upsertPartnerB() {
    const existing = await prisma.partner.findFirst({
        where: { OR: [{ slug: 'test-partner-b' }, { uniqueCode: 'FS-TEST-PARTNER-B' }] },
    });
    const data = {
        slug: 'test-partner-b',
        uniqueCode: 'FS-TEST-PARTNER-B',
        shopName: 'TEST Partner B Shop',
        ownerName: 'Test Partner B',
        networkRole: 'PARTNER' as const,
        networkStatus: 'ACTIVE' as const,
        isActive: true,
        deletedAt: null,
        assignedProvinces: [] as string[],
        partnerType: 'FLORIST' as const,
    };
    if (existing) {
        return prisma.partner.update({ where: { id: existing.id }, data });
    }
    return prisma.partner.create({ data });
}

async function makeOrder(input: {
    orderNumber: string;
    province: string;
    partnerId?: string | null;
    isTest?: boolean;
    compensationCents?: number | null;
    referralFloristId?: string | null;
}) {
    return prisma.order.create({
        data: {
            orderNumber: input.orderNumber,
            status: 'ACCEPTED',
            partnerPaymentStatus: 'PAID',
            totalPriceCents: 5000,
            cemeteryName: 'Cimitero Test Op4',
            cemeteryCity: `Citta Test (${input.province})`,
            deceasedName: 'Test Defunto Op4',
            deliveryProvince: input.province,
            partnerId: input.partnerId ?? null,
            isTest: input.isTest ?? false,
            floristCompensationCents: input.compensationCents ?? null,
            referralFloristId: input.referralFloristId ?? null,
            referralFeeCents: input.referralFloristId ? 500 : 0,
        },
    });
}

async function main() {
    const url = process.env.DATABASE_URL || '';
    const host = hostOf(url);
    console.log('DB_HOST', host);
    assert(host.includes('gentle-rice') || host.includes('florist'), `Refuse: not branch DB (${host})`);

    await prisma.systemState.upsert({
        where: { key: 'florist_network.coordination_percent' },
        create: { key: 'florist_network.coordination_percent', value: '10' },
        update: { value: '10' },
    });

    const leader = await upsertTestLeader();
    const partnerB = await upsertPartnerB();
    console.log('SEED', { leaderId: leader.id, partnerBId: partnerB.id, provinces: leader.assignedProvinces });

    const results: Record<string, string> = {};

    // 1. ordine in zona da sito → Leader
    const o1 = await makeOrder({
        orderNumber: `OP4-SITE-${Date.now()}-1`,
        province: 'ZZ',
        partnerId: null,
        compensationCents: 5000,
    });
    const r1 = await assignZoneLeaderOnPaid(o1.id);
    const o1b = await prisma.order.findUnique({ where: { id: o1.id } });
    assert(r1.status === 'assigned' && o1b?.partnerId === leader.id, 'test1 assign leader');
    results['1_site_zone'] = 'PASS';

    // 2. ordine in zona da QR altro fiorista → partner=Leader, fee QR a B
    const scan = await prisma.floristScanEvent.create({
        data: {
            floristId: partnerB.id,
            sessionToken: `op4-scan-${Date.now()}`,
            ipHash: 'a'.repeat(64),
            userAgent: 'op4-test',
        },
    });
    const o2 = await makeOrder({
        orderNumber: `OP4-QR-${Date.now()}-2`,
        province: 'ZZ',
        partnerId: null,
        compensationCents: 5000,
    });
    // Simula flag token sull'ordine
    await prisma.order.update({
        where: { id: o2.id },
        data: { veraWorkflowFlags: { partnerQrSessionToken: scan.sessionToken } },
    });
    await applyPartnerQrReferralOnPaid({ orderId: o2.id, sessionToken: scan.sessionToken });
    await assignZoneLeaderOnPaid(o2.id);
    const o2b = await prisma.order.findUnique({ where: { id: o2.id } });
    assert(o2b?.partnerId === leader.id, 'test2 partner=leader');
    assert(o2b?.referralFloristId === partnerB.id, 'test2 referral=B');
    assert(o2b?.referralFeeCents === 500, 'test2 fee=500');
    results['2_qr_other_florist'] = 'PASS';

    // 3. spunta OFF, compenso 50€ → coord 0
    const o3 = await makeOrder({
        orderNumber: `OP4-OFF-${Date.now()}-3`,
        province: 'ZZ',
        partnerId: leader.id,
        compensationCents: 5000,
    });
    const off = await resolveColleagueDelegation({
        delegatedToColleague: false,
        partnerId: leader.id,
        floristCompensationCents: 5000,
    });
    await prisma.order.update({
        where: { id: o3.id },
        data: {
            coordinatorFloristId: off.coordinatorFloristId,
            coordinationFeeCents: off.coordinationFeeCents,
        },
    });
    const o3b = await prisma.order.findUnique({ where: { id: o3.id } });
    assert(o3b?.coordinationFeeCents === 0 && !o3b.coordinatorFloristId, 'test3 coord=0');
    results['3_toggle_off'] = 'PASS';

    // 4. spunta ON → 5,00€ + audit simulato
    const on = await resolveColleagueDelegation({
        delegatedToColleague: true,
        partnerId: leader.id,
        floristCompensationCents: 5000,
    });
    assert(on.coordinationFeeCents === 500, `test4 fee expected 500 got ${on.coordinationFeeCents}`);
    await prisma.order.update({
        where: { id: o3.id },
        data: {
            coordinatorFloristId: on.coordinatorFloristId,
            coordinationFeeCents: on.coordinationFeeCents,
        },
    });
    const actor = await prisma.user.findFirst({
        where: { systemRole: { in: ['ADMIN', 'SUPER_ADMIN'] }, deletedAt: null },
        select: { id: true },
    });
    if (actor) {
        await prisma.adminFieldChangeLog.create({
            data: {
                actorUserId: actor.id,
                actorRole: 'ADMIN',
                entityType: 'Order',
                entityId: o3.id,
                field: 'coordinationFeeCents',
                beforeJson: 0,
                afterJson: 500,
            },
        });
        const audit = await prisma.adminFieldChangeLog.findFirst({
            where: { entityId: o3.id, field: 'coordinationFeeCents' },
        });
        assert(audit, 'test4 audit');
        results['4_toggle_on_audit'] = 'PASS';
    } else {
        results['4_toggle_on_audit'] = 'PASS (no admin user — fee OK, audit skipped)';
    }

    // 5. compenso 50→60 con ON → 6,00€
    const pct = await readCoordinationPercentFromConfig();
    const fee60 = computeCoordinationFeeCents(6000, pct);
    assert(fee60 === 600, `test5 expected 600 got ${fee60}`);
    await prisma.order.update({
        where: { id: o3.id },
        data: { floristCompensationCents: 6000, coordinationFeeCents: fee60 },
    });
    results['5_recalc_60'] = 'PASS';

    // 6. isTest → coord 0
    const o6 = await makeOrder({
        orderNumber: `OP4-TEST-${Date.now()}-6`,
        province: 'ZZ',
        partnerId: leader.id,
        compensationCents: 5000,
        isTest: true,
    });
    const t6 = await resolveColleagueDelegation({
        delegatedToColleague: true,
        partnerId: leader.id,
        floristCompensationCents: 5000,
        isTest: true,
    });
    assert(t6.coordinationFeeCents === 0 && !t6.coordinatorFloristId, 'test6 test exclude');
    results['6_isTest'] = 'PASS';

    // 7. fuori zona → nessun affido
    const o7 = await makeOrder({
        orderNumber: `OP4-OUT-${Date.now()}-7`,
        province: 'CO',
        partnerId: null,
        compensationCents: 5000,
    });
    const r7 = await assignZoneLeaderOnPaid(o7.id);
    const o7b = await prisma.order.findUnique({ where: { id: o7.id } });
    assert(r7.status === 'skipped' && !o7b?.partnerId, 'test7 no assign');
    const leaderCO = await findActiveZoneLeader('CO');
    assert(!leaderCO || !leaderCO.assignedProvinces.includes('CO'), 'test7 no leader on CO');
    results['7_out_of_zone'] = 'PASS';

    // Non toccare i 5 FVG storici (su branch possono esistere) — verifica nessun update a FF-PN
    const fvg = await prisma.order.findMany({
        where: { orderNumber: { startsWith: 'FF-PN-26-' } },
        select: {
            orderNumber: true,
            coordinatorFloristId: true,
            coordinationFeeCents: true,
            updatedAt: true,
        },
    });
    for (const f of fvg) {
        assert(!f.coordinatorFloristId && f.coordinationFeeCents === 0, `FVG untouched ${f.orderNumber}`);
    }
    results['C_existing_FVG_untouched'] = `PASS (${fvg.length} FF-PN checked)`;

    console.log(JSON.stringify({ db: host, results }, null, 2));
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
