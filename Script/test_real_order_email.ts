import dotenv from 'dotenv';
import path from 'path';
import prisma from '../lib/prisma';
import { sendFloremTransactionalMail } from '../lib/serverMail';
import { buildOrderStaffHtml } from '../lib/orderEmails';

// Load local environment variables for testing
dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function run() {
    console.log('--- Avvio Test Invio Email Notifica Ordine ---');
    console.log('Provider di Invio:', process.env.RESEND_API_KEY ? 'Resend (attivo)' : 'Nessuno');
    console.log('Mittente (FLOREM_MAIL_FROM):', process.env.FLOREM_MAIL_FROM || 'Non impostato');

    let order: any = null;

    try {
        console.log('Tentativo di connessione al database per recuperare l\'ultimo ordine reale...');
        order = await prisma.order.findFirst({
            orderBy: { createdAt: 'desc' },
            include: {
                items: { include: { product: true } },
                partner: true,
            },
        });
    } catch (e) {
        console.log('ℹ️ Nota: Il database remoto non è raggiungibile da questa connessione locale (regola firewall).');
        console.log('⚙️ Utilizzo un ordine di test completo (Mock Order) per verificare Resend...');
        
        // Mock a very rich and complete order containing all required B2B, Partner, and Funeral info
        order = {
            id: 'mock-order-id-12345',
            orderNumber: 'FT-RM-26-001',
            status: 'ACCEPTED',
            buyerFullName: 'Barbara Bianchi',
            buyerEmail: 'cliente.test@example.com',
            customerPhone: '+39 347 123 4567',
            deceasedName: 'Mario Rossi',
            cemeteryName: 'Cimitero Monumentale del Verano',
            gravePosition: 'Padiglione Galleria C, Loculo 45, Fila 3',
            deliveryProvince: 'RM',
            deliveryDate: new Date('2026-05-24T00:00:00.000Z'),
            agencyName: 'Onoranze Funebri Luce Eterna S.r.l.',
            funeralDate: new Date('2026-05-24T10:30:00.000Z'),
            totalPriceCents: 12500, // €125.00
            ticketMessage: 'Con profondo affetto e immensa gratitudine. Riposa in pace.',
            additionalInstructions: 'Servizio fotografico prima della posa richiesto. Consegnare prima delle ore 10:00.',
            partner: {
                shopName: 'I Fiori di Barbara',
                ownerName: 'Barbara Mancini',
                whatsappNumber: '+39 333 987 6543'
            },
            items: [
                {
                    quantity: 1,
                    priceCents: 11000,
                    product: {
                        name: 'Bouquet Ricordo Affettuoso (Grande)'
                    }
                },
                {
                    quantity: 1,
                    priceCents: 1500,
                    product: {
                        name: 'Nastro Commemorativo Personalizzato (Oro)'
                    }
                }
            ]
        };
    }

    if (!order) {
        console.error('Errore: Impossibile definire l\'ordine per il test.');
        return;
    }

    console.log(`\n=== Informazioni Ordine in invio ===`);
    console.log(`Progressivo: ${order.orderNumber}`);
    console.log(`Defunto: ${order.deceasedName}`);
    console.log(`Luogo Consegna: ${order.cemeteryName}`);
    console.log(`Agenzia Funebre B2B: ${order.agencyName || 'Non specificata'}`);
    console.log(`Fiorista Assegnato: ${order.partner?.shopName || 'Non assegnato'}`);
    console.log(`Totale Ordine: €${(order.totalPriceCents / 100).toFixed(2)}`);
    console.log(`====================================\n`);

    const staffTo = process.env.FLOREM_STAFF_ORDERS_EMAIL?.trim() || 'ordini@floremoria.com';
    const staffHtml = buildOrderStaffHtml({ order: order, stripeSessionId: 'test_session_id_antigravity' });

    console.log(`Tentativo di invio email a: ${staffTo}...`);

    const result = await sendFloremTransactionalMail({
        to: staffTo,
        subject: `[TEST APPLICATIVO] Nuovo ordine pagato ${order.orderNumber || order.id}`,
        html: staffHtml,
    });

    if (result.ok) {
        console.log('\n✅ Successo! Email di test inviata correttamente.');
        console.log('Controlla la casella di posta ordini@floremoria.com o la dashboard di Resend!');
    } else {
        console.error('\n❌ Errore durante l\'invio:', result.error);
    }
}

run()
    .then(() => prisma.$disconnect())
    .catch((err) => {
        console.error('Errore di esecuzione:', err);
        prisma.$disconnect();
    });
