/**
 * Migrazione dati Partner B2B a tre categorie + rinumerazione FF-VE-26-001.
 * Assumption: DATABASE_URL punta a Neon produzione (stesso dello sviluppo locale).
 *
 * - PT-VE-26-002 (reale, funerale) → FF-VE-26-001 + legacyOrderNumber
 * - PT-VE-26-001 (test) → conferma cancellazione + storno fee
 * - AF master fee 10%, IOF → master, CasPer cleanup, duplicato AF soft-delete
 * - backfill masterPartnerId / fee VAT split / PartnerFeeMonthClose
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { calculatePartnerCommissionBreakdown } from '../lib/pricing/calculatePartnerCommission';

const prisma = new PrismaClient();

const AF_MASTER_ID = 'cmpcosjdo00008oncx62bgs5e';
const AF_DUP_FLORIST_ID = 'f067beff-e351-4484-81b2-5b16bdf27801';
const IOF_ID = 'cmu3uxe5c0003ld04f0n95yiq';
const CASPER_ID = 'cmqgpfxwj000jl204jab3fwka';
const REAL_ORDER_ID = 'cmu3swjn70007jj0459wx1et3';

async function main() {
    console.log('=== Partner 3-category data migration ===');

    // --- A1: Rinumera ordine reale ---
    const real = await prisma.order.findUnique({ where: { id: REAL_ORDER_ID } });
    if (!real) throw new Error('Ordine reale non trovato');
    if (real.orderNumber === 'PT-VE-26-002' || real.legacyOrderNumber === 'PT-VE-26-002') {
        const clash = await prisma.order.findFirst({
            where: { orderNumber: 'FF-VE-26-001', id: { not: REAL_ORDER_ID } },
        });
        if (clash) throw new Error('FF-VE-26-001 già assegnato ad altro ordine');

        const fee = calculatePartnerCommissionBreakdown(real.totalPriceCents, 10);
        await prisma.order.update({
            where: { id: REAL_ORDER_ID },
            data: {
                orderNumber: 'FF-VE-26-001',
                legacyOrderNumber: 'PT-VE-26-002',
                isTest: false,
                agencyId: IOF_ID,
                masterPartnerId: AF_MASTER_ID,
                partnerCommissionCents: fee.grossCents,
                partnerCommissionTaxableCents: fee.taxableCents,
                partnerCommissionVatCents: fee.vatCents,
                financeNotes: [
                    real.financeNotes || '',
                    'Rinumerato 16/09/2026: PT-VE-26-002 → FF-VE-26-001 (categoria Funerale). legacyOrderNumber conservato e ricercabile.',
                ]
                    .filter(Boolean)
                    .join('\n'),
            },
        });
        console.log('✓ Rinumerato', REAL_ORDER_ID, '→ FF-VE-26-001 (legacy PT-VE-26-002)');
    } else {
        console.log('… Ordine già rinumerato:', real.orderNumber, 'legacy=', real.legacyOrderNumber);
    }

    // --- A2: Cancella test PT-VE-26-001 + storno fee ---
    const test001 = await prisma.order.findFirst({ where: { orderNumber: 'PT-VE-26-001' } });
    if (test001) {
        await prisma.order.update({
            where: { id: test001.id },
            data: {
                status: 'CANCELLED',
                deletedAt: test001.deletedAt ?? new Date(),
                isTest: true,
                partnerCommissionCents: null,
                partnerCommissionTaxableCents: null,
                partnerCommissionVatCents: null,
                partnerCommissionSettlementStatus: 'PENDING',
                financeNotes: [
                    test001.financeNotes || '',
                    'Cancellato 16/09/2026 (test). Fee maturata stornata (null).',
                ]
                    .filter(Boolean)
                    .join('\n'),
            },
        });
        console.log('✓ PT-VE-26-001 cancellato + fee stornata');
    }

    // --- B: Anagrafica ---
    await prisma.partner.update({
        where: { id: AF_MASTER_ID },
        data: {
            partnerType: 'AGGREGATOR',
            isB2B: true,
            commissionPercentInclusive: new Prisma.Decimal('10.00'),
            partnershipChannel: 'ANNUNCI_FUNEBRI',
        },
    });
    console.log('✓ AF master commissionPercentInclusive=10');

    await prisma.partner.update({
        where: { id: IOF_ID },
        data: {
            partnerType: 'FUNERAL_AGENCY',
            isB2B: true,
            masterPartnerId: AF_MASTER_ID,
            partnershipChannel: 'Annunci Funebri (AF)',
        },
    });
    console.log('✓ IOF → master AF');

    // CasPer: 0 ordini attribuiti (verificato pre-migrazione). Ripulisci uniqueCode spurio.
    const casperOrders = await prisma.order.count({
        where: {
            OR: [
                { partnerId: CASPER_ID },
                { agencyId: CASPER_ID },
                { referralPartnerId: CASPER_ID },
                { masterPartnerId: CASPER_ID },
            ],
            deletedAt: null,
        },
    });
    console.log('CasPer attributions (active):', casperOrders);
    await prisma.partner.update({
        where: { id: CASPER_ID },
        data: {
            isB2B: false,
            partnerType: 'FLORIST',
            uniqueCode: 'FS-RM-CASPER',
            internalNotes: [
                'uniqueCode era fmp_test_annuncifunebri_2026 (chiave API confusa con anagrafica).',
                'Ripulito 16/09/2026. Nessun ordine attribuito via quel codice.',
            ].join(' '),
        },
    });
    console.log('✓ CasPer ripulito');

    // Duplicato AF florist: soft-delete + rewire referral storici
    await prisma.order.updateMany({
        where: { referralPartnerId: AF_DUP_FLORIST_ID },
        data: { masterPartnerId: AF_MASTER_ID },
    });
    await prisma.partner.update({
        where: { id: AF_DUP_FLORIST_ID },
        data: {
            deletedAt: new Date(),
            isActive: false,
            isB2B: false,
            internalNotes: 'Duplicato storico Annunci Funebri (FLORIST). Soft-deleted 16/09/2026 → master AGGREGATOR canonico.',
        },
    });
    console.log('✓ Duplicato AF soft-deleted; referral → masterPartnerId backfill');

    // Backfill masterPartnerId da referralPartnerId dove manca
    const referralRows = await prisma.order.findMany({
        where: {
            referralPartnerId: { not: null },
            masterPartnerId: null,
            deletedAt: null,
        },
        select: { id: true, referralPartnerId: true },
    });
    for (const r of referralRows) {
        const p = await prisma.partner.findUnique({
            where: { id: r.referralPartnerId! },
            select: { partnerType: true, masterPartnerId: true },
        });
        if (!p) continue;
        const masterId =
            p.partnerType === 'AGGREGATOR' ? r.referralPartnerId! : p.masterPartnerId;
        if (masterId) {
            await prisma.order.update({
                where: { id: r.id },
                data: { masterPartnerId: masterId },
            });
        }
    }
    console.log('✓ Backfill masterPartnerId da referral:', referralRows.length);

    // Fee VAT split backfill dove manca
    const feeOrders = await prisma.order.findMany({
        where: {
            partnerCommissionCents: { not: null },
            partnerCommissionTaxableCents: null,
            isTest: false,
            deletedAt: null,
        },
        select: { id: true, partnerCommissionCents: true, totalPriceCents: true },
    });
    for (const o of feeOrders) {
        const gross = o.partnerCommissionCents!;
        const taxable = Math.round(gross / 1.22);
        const vat = gross - taxable;
        await prisma.order.update({
            where: { id: o.id },
            data: {
                partnerCommissionTaxableCents: taxable,
                partnerCommissionVatCents: vat,
            },
        });
    }
    console.log('✓ Fee VAT split backfill:', feeOrders.length);

    // PartnerFeeMonthClose settembre 2026
    const matured = await prisma.order.aggregate({
        where: {
            masterPartnerId: AF_MASTER_ID,
            isTest: false,
            deletedAt: null,
            status: { not: 'CANCELLED' },
            createdAt: {
                gte: new Date('2026-09-01T00:00:00.000Z'),
                lt: new Date('2026-10-01T00:00:00.000Z'),
            },
        },
        _sum: {
            partnerCommissionCents: true,
            partnerCommissionTaxableCents: true,
            partnerCommissionVatCents: true,
        },
    });
    await prisma.partnerFeeMonthClose.upsert({
        where: {
            masterPartnerId_yearMonth: {
                masterPartnerId: AF_MASTER_ID,
                yearMonth: '2026-09',
            },
        },
        create: {
            masterPartnerId: AF_MASTER_ID,
            yearMonth: '2026-09',
            maturedCents: matured._sum.partnerCommissionCents ?? 0,
            maturedTaxableCents: matured._sum.partnerCommissionTaxableCents ?? 0,
            maturedVatCents: matured._sum.partnerCommissionVatCents ?? 0,
            invoiceCents: null,
            connectCents: null,
            toleranceCents: 1,
            status: 'NON_VERIFICABILE',
            exceptionNote: 'Fattura mensile non ancora registrata: C14 non verificabile.',
        },
        update: {
            maturedCents: matured._sum.partnerCommissionCents ?? 0,
            maturedTaxableCents: matured._sum.partnerCommissionTaxableCents ?? 0,
            maturedVatCents: matured._sum.partnerCommissionVatCents ?? 0,
            status: 'NON_VERIFICABILE',
            exceptionNote: 'Fattura mensile non ancora registrata: C14 non verificabile.',
        },
    });
    console.log('✓ PartnerFeeMonthClose 2026-09', matured._sum);

    // Mark existing test credentials environment
    await prisma.partnerApiCredential.updateMany({
        where: { publicId: { startsWith: 'fmp_test_' } },
        data: { environment: 'TEST' },
    });

    console.log('=== DONE ===');
    console.log('NOTA: chiavi LIVE non emesse — Stripe Connect AF non verificato (0 connected accounts).');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
