/**
 * Verifica helper credenziali test partner e filtri dashboard ordini.
 * Esegui: npx tsx scripts/verify-partner-test-orders.ts
 */

import {
    isPartnerTestCredential,
    resolvePartnerApiPaymentKind,
} from '@/lib/partnerTestCredential';
import { ordersListPageWhere } from '@/lib/dashboardOrdersFilter';

function assert(cond: unknown, msg: string): void {
    if (!cond) throw new Error(msg);
}

function main(): void {
    assert(isPartnerTestCredential('fmp_test_annuncifunebri_2026'), 'fmp_test prefix');
    assert(!isPartnerTestCredential('fmp_live_annuncifunebri_2026'), 'live not test');
    assert(resolvePartnerApiPaymentKind(true) === 'TEST_MOCK_PAID', 'test payment kind');
    assert(resolvePartnerApiPaymentKind(false) === 'PARTNER_TERMS', 'prod payment kind');

    const testWhere = ordersListPageWhere(true);
    assert((testWhere as { isTest?: boolean }).isTest === true, 'test mode filter');
    const prodWhere = ordersListPageWhere(false);
    assert((prodWhere as { isTest?: boolean }).isTest === false, 'prod mode filter');

    console.log('OK partner test order visibility helpers');
}

main();
