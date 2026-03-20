import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
    const products = await prisma.product.findMany({});

    for (const p of products) {
        if (!p.mediaUrl) continue;
        
        let newUrl = decodeURI(p.mediaUrl);
        
        // Correct the parent directory
        newUrl = newUrl.replace('/images/products/Bouquet/', '/images/products/fiori-sulle-tombe/');
        newUrl = newUrl.replace('/images/products/Fiori per le tombe/', '/images/products/fiori-sulle-tombe/');
        newUrl = newUrl.replace('/images/products/Funerale/', '/images/products/fiori-per-funerale/'); // assuming similar standardization might happen, but specifically for FT-001:
        
        // Fix specific known filenames
        if (p.slug === 'bouquet-omaggio-speciale') {
            newUrl = '/images/products/fiori-sulle-tombe/bouquet-omaggio-speciale/bouquet-omaggio-speciale-fiori-sulle-tombe-servizio-professionale-FT.webp';
        }

        if (newUrl !== p.mediaUrl) {
            await prisma.product.update({
                where: { id: p.id },
                data: { mediaUrl: newUrl }
            });
            console.log(`Updated ${p.id} to ${newUrl}`);
        }
    }
    
    // Testing specific output
    const testFT = await prisma.product.findFirst({
        where: { slug: 'bouquet-omaggio-speciale' }
    });
    if (testFT) console.log("Test bouquet-omaggio-speciale mediaUrl:", testFT.mediaUrl);
    
    console.log("Migration complete");
}

run().catch(console.error).finally(() => prisma.$disconnect());
