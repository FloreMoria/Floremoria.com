import { loadEnvFiles } from '../lib/loadEnvFiles';
import prisma from '../lib/prisma';

loadEnvFiles();

async function main() {
    console.log('Checking Draft Campaigns:');
    const drafts = await prisma.marketingCampaign.findMany({
        where: { status: 'DRAFT' },
        orderBy: { createdAt: 'desc' }
    });

    console.log(`Total drafts found: ${drafts.length}`);
    for (const d of drafts) {
        console.log(`- ID: ${d.id}`);
        console.log(`  Channel: ${d.targetChannel} | Format: ${d.contentFormat}`);
        console.log(`  Has image: ${d.imageUrl ? 'Yes: ' + d.imageUrl : 'No (empty)'}`);
        console.log(`  Created at: ${d.createdAt.toISOString()}`);
    }
}

main().catch(console.error).finally(async () => {
    await prisma.$disconnect();
});
