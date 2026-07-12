import { loadEnvFiles } from '../lib/loadEnvFiles';
import prisma from '../lib/prisma';

loadEnvFiles();

async function main() {
    console.log('--- Querying MarketingCampaigns ---');
    const counts = await prisma.marketingCampaign.groupBy({
        by: ['status'],
        _count: {
            id: true
        }
    });

    console.log('Campaign statuses counts:');
    console.log(JSON.stringify(counts, null, 2));

    console.log('\nLast 5 campaigns:');
    const lastCampaigns = await prisma.marketingCampaign.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
    });

    console.log(JSON.stringify(lastCampaigns, null, 2));
}

main().catch(err => {
    console.error(err);
}).finally(async () => {
    await prisma.$disconnect();
});
