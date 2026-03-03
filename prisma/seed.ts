import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    const catOmaggi = await prisma.category.upsert({
        where: { slug: 'omaggi-floreali' },
        update: {},
        create: {
            name: 'Omaggi floreali',
            slug: 'omaggi-floreali',
        },
    });

    const catAccessori = await prisma.category.upsert({
        where: { slug: 'accessori' },
        update: {},
        create: {
            name: 'Accessori',
            slug: 'accessori',
        },
    });

    const products = [
        {
            name: 'Ricordo Affettuoso',
            slug: 'ricordo-affettuoso',
            basePriceCents: 2999,
            categoryId: catOmaggi.id,
        },
        {
            name: 'Bouquet di Rose',
            slug: 'bouquet-di-rose',
            basePriceCents: 3499,
            categoryId: catOmaggi.id,
        },
        {
            name: 'Omaggio Speciale',
            slug: 'omaggio-speciale',
            basePriceCents: 3999,
            categoryId: catOmaggi.id,
        },
        {
            name: 'Tributo Eterno',
            slug: 'tributo-eterno',
            basePriceCents: 4999,
            categoryId: catOmaggi.id,
        },
        {
            name: 'Lumino',
            slug: 'lumino',
            basePriceCents: 349,
            categoryId: catAccessori.id,
        },
        {
            name: 'Messaggio',
            slug: 'messaggio',
            basePriceCents: 249,
            categoryId: catAccessori.id,
        },
    ];

    for (const prod of products) {
        const product = await prisma.product.upsert({
            where: { slug: prod.slug },
            update: {
                name: prod.name,
                basePriceCents: prod.basePriceCents,
                categoryId: prod.categoryId,
            },
            create: {
                name: prod.name,
                slug: prod.slug,
                basePriceCents: prod.basePriceCents,
                categoryId: prod.categoryId,
            },
        });

        const placeholderUrl = `/images/products/${product.slug}.webp`;

        // Upsert placeholder image just based on URL for the product
        const existingImages = await prisma.productImage.findMany({
            where: { productId: product.id }
        });

        if (existingImages.length === 0) {
            await prisma.productImage.create({
                data: {
                    productId: product.id,
                    url: placeholderUrl,
                    alt: `Immagine per ${product.name}`
                }
            });
        }
    }

    console.log('Database seeded successfully!');
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })
