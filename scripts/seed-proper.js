const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const officialProducts = [
    {
        name: "Bouquet di Rose",
        slug: "bouquet-di-rose",
        price: 3499,
        description: "Elegante bouquet di rose per un omaggio dolce e delicato.",
        category: 'Fiori sulle Tombe',
        mediaUrl: '/images/products/Bouquet/Bouquet di rose/bouquet-rose-rosse-sulla-tomba.webp'
    },
    {
        name: "Lumino",
        slug: "lumino",
        price: 349,
        description: "Un semplice lumino per illuminare il ricordo.",
        category: 'Fiori sulle Tombe',
        mediaUrl: '/images/products/Lumino/floremoria-lumini-per-le-tombe-1.png'
    },
    {
        name: "Messaggio",
        slug: "messaggio",
        price: 249,
        description: "Un biglietto con un messaggio personalizzato.",
        category: 'Fiori sulle Tombe',
        mediaUrl: '/images/products/Messaggio/floremoria-messaggi-gratis-per-le-tombe-1.jpg'
    },
    {
        name: "Ricordo Affettuoso",
        slug: "bouquet-ricordo-affettuoso",
        price: 2999,
        description: "Un mazzo di fiori freschi per ricordare con affetto i propri cari.",
        category: 'Fiori sulle Tombe',
        mediaUrl: '/images/products/Bouquet/Bouquet Ricordo Affettuoso/bouquet-ricordo-affettuoso-omaggio-floreale.webp'
    },
    {
        name: "Omaggio Speciale",
        slug: "bouquet-omaggio-speciale",
        price: 3999,
        description: "Composizione floreale speciale, curata in ogni minimo dettaglio.",
        category: 'Fiori sulle Tombe',
        mediaUrl: '/images/products/Bouquet/Bouquet Omaggio Speciale/bouquet-omaggio-speciale-omaggio-floreale.webp'
    },
    {
        name: "Tributo Eterno",
        slug: "bouquet-tributo-eterno",
        price: 4999,
        description: "Un tributo eterno e maestoso per onorare una memoria preziosa.",
        category: 'Fiori sulle Tombe',
        mediaUrl: '/images/products/Bouquet/Bouquet Tributo Eterno/bouquet-tributo-eterno-omaggio-floreale.webp'
    },
    {
        name: "Kalonche (pianta in vaso)",
        slug: "kalonche",
        price: 3799,
        description: "Elegante pianta di Kalonche (Kalanchoe) per un ricordo duraturo e fiorito, adatta alla cerimonia funebre.",
        category: 'Per il Funerale',
        mediaUrl: null
    },
    {
        name: "Margherite/Gerbere (pianta in vaso)",
        slug: "margherite-gerbere",
        price: 3999,
        description: "Vaso con fresche e delicate Margherite o Gerbere.",
        category: 'Per il Funerale',
        mediaUrl: null
    },
    {
        name: "Bouquet Rispetto e Vicinanza",
        slug: "bouquet-rispetto-vicinanza",
        price: 3999,
        description: "Un pensiero delicato per esprimere profondo rispetto e vicinanza in momenti difficili.",
        category: 'Per il Funerale',
        mediaUrl: null
    },
    {
        name: "Bouquet Cordoglio Sincero",
        slug: "bouquet-cordoglio-sincero",
        price: 4999,
        description: "Un mazzo di fiori freschi per ricordare con affetto i propri cari.",
        category: 'Per il Funerale',
        mediaUrl: null
    },
    {
        name: "Bouquet Omaggio Solenne",
        slug: "bouquet-omaggio-solenne",
        price: 6999,
        description: "Composizione floreale speciale, curata in ogni minimo dettaglio.",
        category: 'Per il Funerale',
        mediaUrl: null
    },
    {
        name: "Bouquet Memoria Eterna",
        slug: "bouquet-memoria-imperituri",
        price: 8999,
        description: "Un tributo eterno e maestoso per onorare una memoria preziosa.",
        category: 'Per il Funerale',
        mediaUrl: null
    },
    {
        name: "Nastro commemorativo",
        slug: "nastro-commemorativo",
        price: 1499,
        description: "Nastro in raso per un messaggio duraturo allegato alle composizioni.",
        category: 'Per il Funerale',
        mediaUrl: null
    },
    {
        name: "Set Ceri/Candele",
        slug: "set-ceri",
        price: 2499,
        description: "Set di ceri o candele eleganti da accompagnare ai riti funebri.",
        category: 'Per il Funerale',
        mediaUrl: null
    },
    {
        name: "Cuscino",
        slug: "cuscino",
        price: 12999,
        description: "Cuscino floreale adagiato, maestoso ed estremamente curato.",
        category: 'Per il Funerale',
        mediaUrl: null
    },
    {
        name: "Piramide",
        slug: "piramide",
        price: 13999,
        description: "Composizione floreale imponente e verticale a forma di piramide.",
        category: 'Per il Funerale',
        mediaUrl: null
    },
    {
        name: "Copribara",
        slug: "copribara",
        price: 18999,
        description: "Elegante stesura di fiori a copertura totale per la massima onorificenza.",
        category: 'Per il Funerale',
        mediaUrl: null
    },
    {
        name: "Cuore / Corona",
        slug: "cuore-corona",
        price: 19999,
        description: "Tributo solenne di altissimo artigianato floreale lavorato a corona o cuore.",
        category: 'Per il Funerale',
        mediaUrl: null
    }
];

async function main() {
    console.log('Cleaning up existing products and categories...');
    try { await prisma.orderItem.deleteMany({}); } catch (e) { }
    try { await prisma.productImage.deleteMany({}); } catch (e) { }
    try { await prisma.product.deleteMany({}); } catch (e) { }
    try { await prisma.category.deleteMany({}); } catch (e) { }

    console.log('Creating official categories...');
    const catMap = {};
    const categories = [
        { name: 'Fiori sulle Tombe', slug: 'fiori-sulle-tombe', sortOrder: 1 },
        { name: 'Per il Funerale', slug: 'per-il-funerale', sortOrder: 2 },
        { name: 'Per gli animali domestici', slug: 'per-gli-animali-domestici', sortOrder: 3 },
        { name: 'Per gli enti pubblici / aziende', slug: 'per-gli-enti-pubblici-aziende', sortOrder: 4 }
    ];

    for (const c of categories) {
        const cat = await prisma.category.create({ data: c });
        catMap[c.name] = cat.id;
    }

    console.log('Seeding 18 official products from lib/products.ts data...');
    for (const p of officialProducts) {
        await prisma.product.create({
            data: {
                name: p.name,
                slug: p.slug,
                categoryId: catMap[p.category],
                basePriceCents: p.price,
                shortDescription: p.description,
                currency: 'EUR',
                isActive: true,
                isBouquet: true,
                mediaUrl: p.mediaUrl,
            }
        });
    }

    console.log('Successfully re-seeded with official data and images!');
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
