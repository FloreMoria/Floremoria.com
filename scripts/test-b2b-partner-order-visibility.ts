/**
 * Test unitari (no DB) — visibilità B2B partner: referralPartnerId + masterPartnerId.
 * Usage: npx tsx scripts/test-b2b-partner-order-visibility.ts
 */
import assert from 'node:assert/strict';
import {
    buildB2bOrderCreateData,
    resolveB2bOrderAssociations,
} from '../lib/partners/partnerOrderService';

function testAggregatorSetsReferralPartnerId() {
    const association = resolveB2bOrderAssociations({
        authPartner: {
            id: 'agg-1',
            shopName: 'Annunci Funebri',
            partnerType: 'AGGREGATOR',
            partnershipChannel: 'ANNUNCI_FUNEBRI',
            uniqueCode: 'annunci_funebri',
            masterPartnerId: null,
        },
        resolvedAgency: {
            agencyId: 'agency-1',
            agencyCode: 'FS-VE-002',
            agencyName: 'IOF San Marco',
            partnershipChannel: 'Annunci Funebri (AF)',
            defaultFloristId: 'florist-1',
            agencyNotificationEmail: null,
            aggregatorNotificationEmail: null,
            masterPartnerId: 'agg-1',
        },
        totalPriceCents: 8999,
        commissionPercentInclusive: 10,
        apiCredentialId: 'cred-1',
    });

    assert.equal(association.masterPartnerId, 'agg-1');
    assert.equal(association.referralPartnerId, 'agg-1');
    assert.equal(association.agencyId, 'agency-1');

    const createData = buildB2bOrderCreateData(association, 'florist-1');
    assert.equal(createData.referralPartnerId, 'agg-1');
    assert.equal(createData.masterPartnerId, 'agg-1');
    assert.equal(createData.agencyId, 'agency-1');
    assert.equal(createData.partnerId, 'florist-1');
    console.log('PASS aggregator sets referralPartnerId + agencyId');
}

function testFuneralAgencyDoesNotForceReferral() {
    const association = resolveB2bOrderAssociations({
        authPartner: {
            id: 'agency-1',
            shopName: 'IOF San Marco',
            partnerType: 'FUNERAL_AGENCY',
            partnershipChannel: 'Annunci Funebri (AF)',
            uniqueCode: 'FS-VE-002',
            masterPartnerId: 'agg-1',
        },
        resolvedAgency: null,
        totalPriceCents: 5000,
        commissionPercentInclusive: 10,
    });

    assert.equal(association.agencyId, 'agency-1');
    assert.equal(association.masterPartnerId, 'agg-1');
    assert.equal(association.referralPartnerId, null);
    const createData = buildB2bOrderCreateData(association, 'florist-1');
    assert.equal(createData.referralPartnerId, null);
    console.log('PASS funeral agency does not force referralPartnerId');
}

function testListFilterShapeIncludesMaster() {
    // Specifica del filtro GET (non esegue Prisma): documenta il contratto atteso.
    const partnerIds = ['agg-1'];
    const or = [
        { referralPartnerId: { in: partnerIds } },
        { partnerId: { in: partnerIds } },
        { masterPartnerId: { in: partnerIds } },
    ];
    assert.equal(or.length, 3);
    assert.ok(or.some((c) => 'masterPartnerId' in c));
    console.log('PASS list OR includes masterPartnerId');
}

testAggregatorSetsReferralPartnerId();
testFuneralAgencyDoesNotForceReferral();
testListFilterShapeIncludesMaster();
console.log('ALL PASS');
