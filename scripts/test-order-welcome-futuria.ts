import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { sendOrderWelcomeWhatsApp } from '../lib/whatsapp/orderNotify';

async function runTest() {
    const fakeOrder = {
        id: 'test-order-id-12345',
        orderNumber: 'FT-CO-26-999',
        buyerFullName: 'Salvatore Marsiglione',
        buyerEmail: 'staff.floremoria@gmail.com',
        customerPhone: '3204105305',
        deceasedName: 'Ermelinda Rossi'
    };

    console.log('Starting verification of Futuria welcome message trigger...');
    console.log('Order Data:', JSON.stringify(fakeOrder, null, 2));

    try {
        const result = await sendOrderWelcomeWhatsApp(fakeOrder);
        console.log('--- Test Result ---');
        console.log(JSON.stringify(result, null, 2));
    } catch (e) {
        console.error('Test failed with error:', e);
    }
}

runTest();
