import { PrismaClient } from '@prisma/client';
import { generatePartnerCode, generateSupplierCode } from '../lib/codeGenerator';

const prisma = new PrismaClient();

async function main() {
    console.log('Starting backfill process...');

    // 1. Backfill Suppliers
    const suppliers = await prisma.supplier.findMany({
        where: { uniqueCode: null }
    });
    console.log(`Found ${suppliers.length} suppliers to update.`);

    for (const supplier of suppliers) {
        const uniqueCode = await generateSupplierCode();
        await prisma.supplier.update({
            where: { id: supplier.id },
            data: { uniqueCode }
        });
        console.log(`Updated Supplier ${supplier.companyName} -> ${uniqueCode}`);
    }

    // 2. Backfill Partners
    const partners = await prisma.partner.findMany({
        where: { uniqueCode: null }
    });
    console.log(`Found ${partners.length} partners to update.`);

    for (const partner of partners) {
        const province = partner.province || 'XX';
        const uniqueCode = await generatePartnerCode(province);
        await prisma.partner.update({
            where: { id: partner.id },
            data: {
                uniqueCode,
                province: province // Set placeholder XX if it was null
            }
        });
        console.log(`Updated Partner ${partner.shopName} -> ${uniqueCode}`);
    }

    console.log('Backfill process completed successfully!');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
