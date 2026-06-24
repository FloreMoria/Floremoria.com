import { NextRequest } from 'next/server';
import { GET, POST } from '../app/api/whatsapp/webhook/route';

// Imposta le variabili d'ambiente per il test
process.env.WHATSAPP_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.WHATSAPP_APP_SECRET = 'test-app-secret';
process.env.GEMINI_API_KEY = 'mock-gemini-key';

async function runTests() {
    console.log('--- Esecuzione Test Webhook WhatsApp ---');

    // 1. Test GET Handshake (Meta style)
    try {
        const reqGet = new NextRequest(
            'http://localhost:3000/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=test-webhook-secret&hub.challenge=123456'
        );
        const resGet = await GET(reqGet);
        const textGet = await resGet.text();
        console.log('Test GET verification result:', resGet.status === 200 && textGet === '123456' ? 'PASS ✅' : 'FAIL ❌');
        console.log('GET status:', resGet.status, 'Body:', textGet);
    } catch (e) {
        console.error('Errore nel test GET:', e);
    }

    // 2. Test POST Meta Message payload (Mock payload)
    try {
        const metaPayload = {
            object: 'whatsapp_business_account',
            entry: [
                {
                    id: '123456789',
                    changes: [
                        {
                            value: {
                                messaging_product: 'whatsapp',
                                metadata: {
                                    display_phone_number: '393204105305',
                                    phone_number_id: '987654321'
                                },
                                contacts: [
                                    {
                                        profile: { name: 'Giuseppe Test' },
                                        wa_id: '393333333333'
                                    }
                                ],
                                messages: [
                                    {
                                        from: '393333333333',
                                        id: 'wamid.MockMessageId123',
                                        timestamp: '1719158000',
                                        type: 'text',
                                        text: { body: 'Ciao VERA' }
                                    }
                                ]
                            },
                            field: 'messages'
                        }
                    ]
                }
            ]
        };

        const payloadStr = JSON.stringify(metaPayload);
        
        // Calcola la firma HMAC-SHA256 (Meta style)
        const crypto = require('crypto');
        const hmac = crypto.createHmac('sha256', 'test-app-secret');
        const hash = hmac.update(payloadStr).digest('hex');
        const signature = `sha256=${hash}`;

        const reqPost = new NextRequest('http://localhost:3000/api/whatsapp/webhook', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-hub-signature-256': signature
            },
            body: payloadStr
        });

        // Nota: Il POST interagirà con Prisma (DB local), quindi mockiamo o gestiamo
        // Se non abbiamo un db local attivo a livello prisma potrebbe dare errore di prisma client,
        // ma noi vogliamo soprattutto testare che non ci siano errori di sintassi o parsing
        const resPost = await POST(reqPost);
        const textPost = await resPost.text();
        console.log('Test POST payload parsing result status:', resPost.status);
        console.log('POST Response:', textPost);
    } catch (e) {
        console.error('Errore nel test POST (Prisma potrebbe non essere connesso):', e);
    }
}

runTests();
