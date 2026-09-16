/**
 * Build-breaker: nessun contenuto destinato a un fiorista può contenere
 * email/telefono cliente o prezzo di vendita.
 *
 * Eseguito da `prebuild` — exit 1 rompe la build.
 */
import assert from 'node:assert/strict';
import { buildOrderStaffHtml } from '../lib/orderEmails';
import {
    assertFloristOutboundContentSafe,
    buildFloristOrderBriefFromOrder,
    floristOrderBriefKeys,
    FLORIST_ORDER_BRIEF_ALLOWED_KEYS,
    renderFloristOrderBriefEmailHtml,
} from '../lib/orders/floristOrderBrief';
import { buildFloristNuovoOrdineBodyParams } from '../lib/whatsapp/buildFloristNuovoOrdineParams';

function fail(msg: string): never {
    console.error(`[florist-privacy] FAIL: ${msg}`);
    process.exit(1);
}

function ok(msg: string) {
    console.log(`[florist-privacy] OK: ${msg}`);
}

async function main() {
    const mockOrder = {
        id: 'cm_test_privacy_order',
        orderNumber: 'FF-PN-26-999',
        status: 'IN_PROGRESS',
        userId: null,
        deceasedName: 'Mario Rossi',
        deceasedBirthDate: null,
        deceasedDeathDate: null,
        cemeteryName: 'Cimitero Maggiore',
        cemeteryCity: 'Pordenone',
        gravePosition: 'Campo A',
        deliveryDate: new Date('2026-09-20T08:00:00.000Z'),
        totalPriceCents: 12999,
        currency: 'EUR',
        photos: [] as string[],
        createdAt: new Date('2026-09-16T12:00:00.000Z'),
        updatedAt: new Date('2026-09-16T12:00:00.000Z'),
        customerPhone: '+393331112233',
        ticketMessage: 'Con affetto',
        buyerCity: null,
        buyerCountry: null,
        buyerFullName: 'Natale Fedrigo',
        buyerEmail: 'natalefed@hotmail.com',
        isRecurring: false,
        deletedAt: null,
        mergedIntoId: null,
        additionalInstructions: 'IMPORT_MANUALE: dashboard admin',
        funeralDate: null,
        latitude: null,
        longitude: null,
        partnerId: 'partner_test',
        agencyId: null,
        agencyCode: null,
        agencyName: null,
        partnershipChannel: null,
        partnerNotifyEmail: null,
        partnerPaymentStatus: 'PAID',
        deliveryProvince: 'PN',
        proofFotoCode: null,
        proofFotoExpiresAt: null,
        isFirstOrderForPartner: null,
        veraWorkflowFlags: null,
        confirmationMessageSent: false,
        veraAlertType: null,
        veraAlertMessage: null,
        veraAlertAt: null,
        veraAlertPriority: null,
        orderFrozenAt: null,
        orderFrozenReason: null,
        externalAnnouncementId: null,
        deceasedProfileId: null,
        referralPartnerId: null,
        masterPartnerId: null,
        apiCredentialId: null,
        legacyOrderNumber: null,
        partnerCommissionCents: null,
        partnerCommissionTaxableCents: null,
        partnerCommissionVatCents: null,
        partnerCommissionSettlementStatus: 'PENDING',
        grossAmount: 129.99,
        stripeFee: null,
        netAmount: null,
        stripeTransactionId: 'pi_test',
        floristCompensationCents: 5000,
        floristVatRate: null,
        floristSettlementStatus: 'PENDING',
        accessoryAmountCents: null,
        paymentMethodLabel: null,
        financeNotes: null,
        isTest: false,
        partner: {
            id: 'partner_test',
            shopName: 'Fioreria Test',
            ownerName: 'Silvia',
            internalNotes: null,
            whatsappNumber: '+393200000000',
            email: 'fiorista@example.com',
        },
        items: [
            {
                id: 'item1',
                orderId: 'cm_test_privacy_order',
                productId: 'prod1',
                quantity: 1,
                priceCents: 12999,
                product: {
                    id: 'prod1',
                    name: 'Cuscino funebre',
                    basePriceCents: 12999,
                    slug: 'cuscino',
                },
            },
        ],
    } as any;

    // 1) Brief dedicato: chiavi solo whitelist
    const brief = buildFloristOrderBriefFromOrder(mockOrder);
    const keys = floristOrderBriefKeys(brief);
    for (const k of keys) {
        if (!(FLORIST_ORDER_BRIEF_ALLOWED_KEYS as readonly string[]).includes(k)) {
            fail(`chiave non ammessa nel brief: ${k}`);
        }
    }
    for (const forbidden of ['buyerEmail', 'customerPhone', 'buyerFullName', 'totalPriceCents']) {
        assert.equal((brief as any)[forbidden], undefined);
    }
    ok('FloristOrderBrief senza campi cliente/prezzo vendita');

    // 2) HTML brief: safe
    const html = renderFloristOrderBriefEmailHtml(brief);
    assertFloristOutboundContentSafe(html, {
        knownCustomerEmail: mockOrder.buyerEmail,
        knownCustomerPhone: mockOrder.customerPhone,
        knownSalePriceLabel: '€129.99',
    });
    assertFloristOutboundContentSafe(html, {
        knownSalePriceLabel: '129,99',
    });
    ok('HTML fiorista non contiene email/tel/prezzo vendita');

    // 3) Modello staff riusato → DEVE fallire
    const staffHtml = buildOrderStaffHtml({
        order: mockOrder,
        stripeSessionId: 'Nuovo ordine assegnato',
    });
    let staffBlocked = false;
    try {
        assertFloristOutboundContentSafe(staffHtml, {
            knownCustomerEmail: mockOrder.buyerEmail,
            knownCustomerPhone: mockOrder.customerPhone,
            knownSalePriceLabel: '€129.99',
        });
    } catch {
        staffBlocked = true;
    }
    if (!staffBlocked) {
        fail('buildOrderStaffHtml avrebbe dovuto essere rifiutato come contenuto fiorista');
    }
    ok('buildOrderStaffHtml (causa incidente) viene rifiutato');

    // 4) WhatsApp params: niente email/tel/prezzo vendita 129,99
    const waParams = buildFloristNuovoOrdineBodyParams({
        floristFirstName: 'Silvia',
        orderCode: mockOrder.orderNumber,
        deceasedName: mockOrder.deceasedName,
        cemeteryName: mockOrder.cemeteryName,
        cemeteryCity: mockOrder.cemeteryCity,
        province: 'PN',
        gravePosition: mockOrder.gravePosition,
        ticketMessage: mockOrder.ticketMessage,
        items: mockOrder.items,
        deliveryDate: mockOrder.deliveryDate,
        createdAt: mockOrder.createdAt,
        orderId: mockOrder.id,
    });
    const waJoined = waParams.join(' | ');
    assertFloristOutboundContentSafe(waJoined, {
        knownCustomerEmail: mockOrder.buyerEmail,
        knownCustomerPhone: mockOrder.customerPhone,
        knownSalePriceLabel: '129,99',
    });
    if (waJoined.toLowerCase().includes('natalefed')) {
        fail('WhatsApp params contengono email cliente');
    }
    ok('WhatsApp floremoria_nuovo_ordine_fiorista senza dati cliente/prezzo vendita');

    console.log('[florist-privacy] tutti i controlli superati');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
