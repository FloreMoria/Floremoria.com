import { resolveOrderByPublicRef } from '../lib/orders/resolveOrderIdentifier';
import { peekNextOrderNumber } from '../lib/orders/orderNumber';
import { calculatePartnerCommissionBreakdown } from '../lib/pricing/calculatePartnerCommission';

async function main() {
    const byLegacy = await resolveOrderByPublicRef('PT-VE-26-002', {
        id: true,
        orderNumber: true,
        legacyOrderNumber: true,
        agencyId: true,
        masterPartnerId: true,
        partnerCommissionCents: true,
        partnerCommissionTaxableCents: true,
        partnerCommissionVatCents: true,
    });
    console.log('SEARCH_LEGACY', byLegacy);
    const nextFF = await peekNextOrderNumber({ orderCategory: 'FF', deliveryProvince: 'VE' });
    const nextFT = await peekNextOrderNumber({ orderCategory: 'FT', deliveryProvince: 'VE' });
    console.log('NEXT', { nextFF, nextFT });
    console.log('FEE100', calculatePartnerCommissionBreakdown(10000, 10));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
