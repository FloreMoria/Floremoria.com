import prisma from '../lib/prisma';

async function main() {
    const rows = await prisma.partner.findMany({
        where: { deletedAt: null, partnerType: { in: ['AGGREGATOR', 'FUNERAL_AGENCY'] } },
        select: {
            id: true,
            shopName: true,
            uniqueCode: true,
            partnerType: true,
            masterPartnerId: true,
            isActive: true,
        },
        orderBy: { shopName: 'asc' },
    });
    console.log(JSON.stringify(rows, null, 2));
    const creds = await prisma.partnerApiCredential.findMany({
        select: {
            id: true,
            publicId: true,
            environment: true,
            isActive: true,
            partnerId: true,
            label: true,
        },
        orderBy: { createdAt: 'desc' },
    });
    console.log('CREDS', JSON.stringify(creds, null, 2));
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
