import { loadEnvFiles } from '../lib/loadEnvFiles';
loadEnvFiles();

import { syncFloristPartnerToFuturia } from '../lib/futuria/client';
import { getFuturiaApiKey, getFuturiaApiBase, getFuturiaApiVersion } from '../lib/futuria/config';

async function verifyContactOnFuturia(contactId: string) {
    const apiKey = getFuturiaApiKey();
    const apiBase = getFuturiaApiBase();
    const apiVersion = getFuturiaApiVersion();

    if (!apiKey) {
        console.error('❌ FUTURIA_API_KEY non configurata!');
        return;
    }

    console.log(`\n🔍 Verifica contatto ${contactId} direttamente su Futuria API...`);
    const response = await fetch(`${apiBase}/contacts/${contactId}`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Version': apiVersion,
            'Accept': 'application/json'
        }
    });

    if (!response.ok) {
        console.error(`❌ Impossibile recuperare il contatto. Status: ${response.status}`);
        const text = await response.text();
        console.error('Body:', text);
        return;
    }

    const data = await response.json();
    const contact = data.contact;
    console.log('✅ Contatto recuperato con successo!');
    console.log('--- DETTAGLI CONTATTO ---');
    console.log('👤 Nome Completo:', contact.fullName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim());
    console.log('📞 Telefono:', contact.phone);
    console.log('✉️ Email:', contact.email);
    console.log('🏷️ Tags:', contact.tags);
    console.log('🧩 Campi personalizzati presenti:');
    if (contact.customFields && Array.isArray(contact.customFields)) {
        contact.customFields.forEach((cf: any) => {
            console.log(`   - ID: ${cf.id} | Valore: "${cf.value ?? cf.field_value ?? ''}"`);
        });
    } else {
        console.log('   - Nessun campo personalizzato.');
    }
}

async function runTest() {
    console.log('🚀 Avvio test sincronizzazione Fiorista Partner su Futuria CRM...');

    const testFlorist = {
        shopName: 'Fiorista Antigravity Test Srl',
        ownerName: 'Mario Rossi',
        whatsappNumber: '+39 347 123 4567',
        pecAddress: 'fioristatest@pec.it',
        order: {
            deceasedName: 'Esempio Defunto Antigravity',
            cemeteryCity: 'Cimitero Monumentale di Milano',
            gravePosition: 'Campo 4, Giardino delle Rimembranze, Loculo 12',
            deceasedDeathDate: new Date('2026-06-10'),
            additionalInstructions: 'Lasciare i fiori vicino all\'ingresso monumentale alle 10:00.',
            totalPriceCents: 15000, // 150.00 EUR
            partnerNotifyEmail: 'info@fioristatest.it',
            items: [
                {
                    priceCents: 10000,
                    product: { name: 'Corona Funebre' }
                },
                {
                    priceCents: 5000,
                    product: { name: 'Lumino' }
                }
            ]
        }
    };

    console.log('\n1️⃣ Esecuzione syncFloristPartnerToFuturia con ordine di test...');
    try {
        const contactId = await syncFloristPartnerToFuturia(testFlorist);
        
        console.log('\n2️⃣ Esecuzione upsertFuturiaContact diretto con chiavi note (contact.defunto_ultimo)...');
        const { upsertFuturiaContact } = require('../lib/futuria/client');
        await upsertFuturiaContact({
            phone: '+393471234567',
            name: 'Fiorista Antigravity Test Srl',
            additionalCustomFields: {
                'contact.defunto_ultimo': 'Test Defunto Fiorista',
                'contact.defunto': 'Test Defunto Fiorista Storico'
            }
        });

        if (contactId) {
            console.log(`\n✅ Sincronizzazione riuscita! Contact ID su Futuria: ${contactId}`);
            await verifyContactOnFuturia(contactId);
        } else {
            console.error('❌ Sincronizzazione fallita (contactId nullo). Controlla se Futuria è configurata correttamente.');
        }
    } catch (error) {
        console.error('❌ Errore durante il test:', error);
    }
}

runTest();
