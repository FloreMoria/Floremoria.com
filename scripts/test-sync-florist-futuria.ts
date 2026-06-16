import { loadEnvFiles } from '../lib/loadEnvFiles';
loadEnvFiles();

import { upsertFuturiaContact } from '../lib/futuria/client';
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
    console.log('--- DETTAGLI CONTATTO RILEVATI ---');
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

async function runTwoStepTest() {
    console.log('🚀 Avvio Invio Real-Test a due fasi su Futuria CRM...');

    const basePayload = {
        phone: '+393111111114', // Quarto contatto nuovo di zecca
        firstName: 'Benedetta',
        email: 'fioristanuovo314@pec.it',
        additionalCustomFields: {
            'contact.costo_servizio': '45,00€',
            'costo_servizio': '45,00€',
            'contact.comune_cimitero': 'Como',
            'comune_cimitero': 'Como',
            'contact.nome_defunto': 'Luigi Rossi',
            'nome_defunto': 'Luigi Rossi',
            'contact.data_decesso': '12/03/2026',
            'data_decesso': '12/03/2026',
            'contact.posizione_tomba': 'Campo C, Fila 3, Loculo 12',
            'posizione_tomba': 'Campo C, Fila 3, Loculo 12',
            'contact.info_posizione': 'Ingresso Nord, vicino alla fontana grande',
            'info_posizione': 'Ingresso Nord, vicino alla fontana grande'
        }
    };

    try {
        console.log('\n1️⃣ Fase 1: Creazione contatto SENZA tag per registrare l\'anagrafica...');
        const contactId = await upsertFuturiaContact({
            ...basePayload,
            tags: [] // Nessun tag per ora
        });
        console.log(`✅ Contatto creato! ID: ${contactId}`);

        console.log('\n⏳ Attesa di 3 secondi per la propagazione sul database del CRM...');
        await new Promise((resolve) => setTimeout(resolve, 3000));

        console.log('\n2️⃣ Fase 2: Aggiornamento contatto AGGIUNGENDO il tag "Nuovo-Fiorista"...');
        const updatedContactId = await upsertFuturiaContact({
            ...basePayload,
            tags: ['Nuovo-Fiorista'] // Aggiungiamo il tag per simulare l'evento Tag Added
        });

        if (updatedContactId) {
            console.log(`\n✅ Tag aggiunto con successo! ID contatto: ${updatedContactId}`);
            await verifyContactOnFuturia(updatedContactId);
        } else {
            console.error('❌ Fallimento durante l\'aggiunta del tag.');
        }
    } catch (error) {
        console.error('❌ Errore durante l\'invio API:', error);
    }
}

runTwoStepTest();
