import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function run() {
    const key = (process.env.RESEND_API_KEY || '').trim();
    const from = (process.env.FLOREM_MAIL_FROM || '').trim();
    
    console.log('Chiave usata per fetch:', JSON.stringify(key));
    console.log('Mittente usato per fetch:', JSON.stringify(from));

    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from,
            to: ['ordini@floremoria.com'],
            subject: 'Test Raw Fetch',
            html: '<p>Test di invio tramite fetch nativo Node.js</p>',
        }),
    });

    console.log('Status Risposta:', res.status, res.statusText);
    const body = await res.text();
    console.log('Corpo Risposta:', body);
}

run();
