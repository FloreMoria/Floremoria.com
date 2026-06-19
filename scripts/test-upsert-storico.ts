import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { upsertFuturiaContact } from '../lib/futuria/client';

async function runUpsertTest() {
    const testPayload = {
        phone: '+393204105305',
        name: 'Salvatore Marsiglione',
        deceasedName: 'Ermelinda Rossi',
        // Includiamo 'utente-storico' come richiesto e anche il tag trigger 'floremoria-nuovo-ordine'
        // in modo che il workflow si attivi e valuti il contatto che possiede già entrambi i tag.
        tags: ['utente-storico', 'floremoria-nuovo-ordine'],
        orderNumber: 'FT-CO-26-TEST-STORICO'
    };

    console.log('Sending API test request to Futuria CRM...');
    console.log('Payload:', JSON.stringify(testPayload, null, 2));

    try {
        const contactId = await upsertFuturiaContact(testPayload, {
            source: 'paid_order',
            orderId: process.env.FUTURIA_TEST_ORDER_ID || 'test-order-id',
        });
        console.log('--- Upsert Successful ---');
        console.log(`Contact ID: ${contactId}`);
    } catch (e) {
        console.error('API call failed with error:', e);
    }
}

runUpsertTest();
