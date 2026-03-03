const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    console.log('Cleaning up existing products and categories...');
    try { await prisma.orderItem.deleteMany({}); } catch (e) { }
    try { await prisma.productImage.deleteMany({}); } catch (e) { }
    try { await prisma.product.deleteMany({}); } catch (e) { }
    try { await prisma.category.deleteMany({}); } catch (e) { }

    console.log('Inserting official categories...');
    const cat1 = await prisma.category.create({ data: { name: 'Fiori sulle Tombe', slug: 'fiori-sulle-tombe', sortOrder: 1 } });
    const cat2 = await prisma.category.create({ data: { name: 'Per il Funerale', slug: 'per-il-funerale', sortOrder: 2 } });
    const cat3 = await prisma.category.create({ data: { name: 'Per gli animali domestici', slug: 'per-gli-animali-domestici', sortOrder: 3 } });
    const cat4 = await prisma.category.create({ data: { name: 'Per gli enti pubblici / aziende', slug: 'per-gli-enti-pubblici-aziende', sortOrder: 4 } });

    console.log('Inserting 18 official products...');

    const products = [
        // Fiori sulle Tombe (6)
        { name: 'Bouquet Ricordo Affettuoso', catId: cat1.id, price: 4500, desc: 'Un dolce pensiero floreale per ricordare con affetto chi non c`è più.' },
        { name: 'Bouquet di Rose Rosse classiche', catId: cat1.id, price: 6500, desc: 'Il classico omaggio per esprimere amore eterno.' },
        { name: 'Composizione Primaverile', catId: cat1.id, price: 5500, desc: 'Colori vivaci e fiori freschi per ravvivare il ricordo.' },
        { name: 'Mazzo di Gigli Bianchi', catId: cat1.id, price: 5000, desc: 'L`eleganza del giglio bianco, simbolo di purezza e pace.' },
        { name: 'Cuscino a Cuore Floreale', catId: cat1.id, price: 8500, desc: 'Un cuore di fiori delicati per un dono d`amore sulla lapide.' },
        { name: 'Vaso di Orchidee', catId: cat1.id, price: 6000, desc: 'Orchidee resistenti ed eleganti, perfette come pensiero duraturo.' },

        // Per il Funerale (12)
        { name: 'Cuscino Funerario Bianco', catId: cat2.id, price: 12000, desc: 'Cuscino floreale elegante con fiori bianchi assortiti.' },
        { name: 'Corona Funeraria Elegance', catId: cat2.id, price: 25000, desc: 'Corona di grandi dimensioni con rose e gigli.' },
        { name: 'Copribara di Rose', catId: cat2.id, price: 30000, desc: 'Sontuoso copribara interamente realizzato con rose fresche.' },
        { name: 'Composizione per Altare', catId: cat2.id, price: 15000, desc: 'Decorazione floreale raffinata per l`altare durante la cerimonia.' },
        { name: 'Croce Floreale Tradizionale', catId: cat2.id, price: 18000, desc: 'Omaggio a forma di croce con garofani e crisantemi.' },
        { name: 'Cuore Funebre Amore Infinito', catId: cat2.id, price: 20000, desc: 'Cuore pieno di rose rosse per l`ultimo saluto.' },
        { name: 'Cuscino Funerario Misto', catId: cat2.id, price: 13000, desc: 'Cuscino con un assortimento di fiori stagionali dai toni delicati.' },
        { name: 'Corona Semplice', catId: cat2.id, price: 18000, desc: 'Corona di fiori modesta ma onorevole per un saluto affettuoso.' },
        { name: 'Composizione Cesto Funebre', catId: cat2.id, price: 9500, desc: 'Cesto a terra con fiori freschi per arredare la camera ardente.' },
        { name: 'Mazzo Funerario da Mano', catId: cat2.id, price: 5000, desc: 'Pratico mazzo stilizzato da portare e poggiare sulla bara.' },
        { name: 'Copribara Misto Stagionale', catId: cat2.id, price: 22000, desc: 'Copribara colorato e dolce, ideale per omaggiare la vita passata.' },
        { name: 'Palma Decorativa Floreale', catId: cat2.id, price: 16000, desc: 'Composizione alta su stelo per fiancheggiare la bara o l`altare.' },
    ];

    for (const p of products) {
        await prisma.product.create({
            data: {
                name: p.name,
                slug: p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                categoryId: p.catId,
                basePriceCents: p.price,
                shortDescription: p.desc,
                currency: 'EUR',
                isActive: true,
                isBouquet: true,
                mediaUrl: null, // Placeholder
            }
        });
    }

    console.log('Seeded 18 products successfully!');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
