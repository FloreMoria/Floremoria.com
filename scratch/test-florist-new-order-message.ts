/**
 * Test formattazione prodotto + messaggio Punto A fiorista.
 * Esegui: npx tsx scratch/test-florist-new-order-message.ts
 */
import { formatFloristProductLabel } from '../lib/orders/formatFloristProductLabel';
import { buildFloristNewOrderWhatsAppText } from '../lib/orders/floristDeliveryLinkMessage';

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(`FAIL: ${message}`);
    console.log(`OK: ${message}`);
}

function main(): void {
    assert(
        formatFloristProductLabel({ name: 'Bouquet Memoria Eterna', isBouquet: true }) === 'Bouquet',
        'Bouquet commerciale → Bouquet'
    );
    assert(
        formatFloristProductLabel({ name: 'Bouquet Rispetto e Vicinanza', slug: 'bouquet-rispetto-vicinanza' }) ===
            'Bouquet',
        'Bouquet rispetto → Bouquet'
    );
    assert(formatFloristProductLabel({ name: 'Cuscino', slug: 'cuscino', isBouquet: true }) === 'Cuscino', 'Cuscino');
    assert(formatFloristProductLabel({ name: 'Corona floreale' }) === 'Corona', 'Corona');
    assert(formatFloristProductLabel({ name: 'Cuore commemorativo' }) === 'Cuore', 'Cuore');
    assert(formatFloristProductLabel({ name: 'Piramide' }) === 'Piramide', 'Piramide');
    assert(formatFloristProductLabel({ name: 'Copribara' }) === 'Copribara', 'Copribara');
    assert(
        formatFloristProductLabel({ name: 'Kalonchoe (pianta in vaso)', slug: 'kalonche' }) ===
            'Pianta in vaso - Kalonchoe',
        'Kalonchoe pianta'
    );
    assert(
        formatFloristProductLabel({ name: 'Margherite/Gerbere (pianta in vaso)', slug: 'margherite-gerbere' }) ===
            'Pianta in vaso - Margherite/Gerbere',
        'Margherite pianta'
    );

    const text = buildFloristNewOrderWhatsAppText({
        floristFirstName: 'Simone',
        orderCode: 'FT-MB-26-001',
        city: 'Milano',
        deceasedName: 'Mario Rossi',
        cemeteryName: 'Cimitero Maggiore',
        cemeteryCity: 'Milano',
        gravePosition: 'Campo C, Tomba 83',
        ticketMessage: null,
        additionalInstructions: null,
        items: [
            {
                quantity: 1,
                product: { name: 'Bouquet Memoria Eterna', slug: 'bouquet-memoria-eterna', isBouquet: true },
            },
            { quantity: 1, product: { name: 'Lumino', slug: 'lumino', isBouquet: false } },
        ],
        deliveryUrl: 'https://www.floremoria.com/fiorista/consegna/FT-MB-26-001',
    });

    assert(text.includes('Ciao Simone! 🌸'), 'saluto');
    assert(text.includes('ordine FT-MB-26-001 a Milano'), 'codice e città');
    assert(text.includes('💐 Prodotto: Bouquet'), 'prodotto formattato');
    assert(text.includes('📝 Testo Biglietto: Nessuno'), 'biglietto default');
    assert(text.includes('➕ Optional / Accessori: Lumino'), 'accessori');
    assert(text.includes('📌 Note di Consegna: Nessuna nota aggiuntiva'), 'note default');
    assert(text.includes('🔗 https://www.floremoria.com/fiorista/consegna/FT-MB-26-001'), 'link mini-app');
    assert(text.endsWith('Vera | Staff FloreMoria 🌹'), 'chiusura con rosa unica');
    assert((text.match(/🌹/g) || []).length === 1, 'una sola rosa');
    assert(!text.includes('Bouquet Memoria Eterna'), 'niente nome commerciale bouquet');

    console.log('\nTutti i test messaggio fiorista OK.');
}

main();
