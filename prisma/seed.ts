import { PrismaClient } from '@prisma/client';
import { products as catalogProducts } from '../lib/products';

const prisma = new PrismaClient();

function categoryMeta(category?: 'cimitero' | 'funerale' | 'animali') {
    switch (category) {
        case 'funerale':
            return { slug: 'funerale', name: 'Fiori per Funerali' };
        case 'animali':
            return { slug: 'animali', name: 'Piccoli Amici' };
        default:
            return { slug: 'cimitero', name: 'Fiori sulle Tombe' };
    }
}

async function ensureCategory(slug: string, name: string) {
    return prisma.category.upsert({
        where: { slug },
        update: { name },
        create: { slug, name },
    });
}

async function main() {
    const categories = new Map<string, { id: string }>();

    // 1) Crea/aggiorna le categorie usate dal catalogo
    for (const p of catalogProducts) {
        const meta = categoryMeta(p.category);
        if (!categories.has(meta.slug)) {
            const cat = await ensureCategory(meta.slug, meta.name);
            categories.set(meta.slug, { id: cat.id });
        }
    }

    // 2) Crea/aggiorna tutti i prodotti del catalogo statico nel DB
    for (const p of catalogProducts) {
        const meta = categoryMeta(p.category);
        const categoryId = categories.get(meta.slug)?.id;
        if (!categoryId) continue;

        const basePriceCents = Math.round((p.price || 0) * 100);
        const product = await prisma.product.upsert({
            where: { slug: p.slug },
            update: {
                name: p.name,
                basePriceCents,
                categoryId,
                isBouquet: p.isBouquet ?? true,
                isActive: true,
            },
            create: {
                // Manteniamo l'ID statico solo per "foto-stato-prima" per compatibilita' carrello.
                ...(p.id === 'florem-foto-stato-prima' ? { id: p.id } : {}),
                name: p.name,
                slug: p.slug,
                basePriceCents,
                categoryId,
                isBouquet: p.isBouquet ?? true,
                isActive: true,
            },
        });

        // 3) Placeholder immagine se assente
        const existingImages = await prisma.productImage.findMany({
            where: { productId: product.id },
            take: 1,
        });
        if (existingImages.length === 0) {
            await prisma.productImage.create({
                data: {
                    productId: product.id,
                    url: `/images/products/${product.slug}.webp`,
                    alt: `Immagine per ${product.name}`,
                },
            });
        }
    }
    // 4) Seed Partner B2B Annunci Funebri & Credenziali di Test
    const partnerId = 'f067beff-e351-4484-81b2-5b16bdf27801';
    await prisma.partner.upsert({
        where: { id: partnerId },
        update: {
            shopName: 'Annunci Funebri',
            ownerName: 'Referral Partner',
            uniqueCode: 'ANNUNCI_FUNEBRI',
            isActive: true,
        },
        create: {
            id: partnerId,
            shopName: 'Annunci Funebri',
            ownerName: 'Referral Partner',
            uniqueCode: 'ANNUNCI_FUNEBRI',
            address: 'Milano',
            province: 'MI',
            whatsappNumber: '393111111111',
            isActive: true,
        },
    });

    const testPublicId = 'fmp_test_annuncifunebri_2026';
    const testSecretPlain = 'fms_test_secret_af_99';
    const { hashPartnerApiSecret } = require('../lib/partnerApiSecret');
    const secretHash = hashPartnerApiSecret(testSecretPlain);

    await prisma.partnerApiCredential.upsert({
        where: { publicId: testPublicId },
        update: {
            partnerId,
            isActive: true,
        },
        create: {
            partnerId,
            label: 'Test Annunci Funebri',
            publicId: testPublicId,
            secretHash,
            isActive: true,
        },
    });

    console.log(`Database seeded successfully with ${catalogProducts.length} products and B2B credentials.`);
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
