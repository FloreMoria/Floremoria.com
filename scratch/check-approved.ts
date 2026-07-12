import { loadEnvFiles } from '../lib/loadEnvFiles';
import prisma from '../lib/prisma';

loadEnvFiles();

async function main() {
    console.log('Checking Approved Campaigns:');
    const approved = await prisma.marketingCampaign.findMany({
        where: { status: 'APPROVED' },
        orderBy: { createdAt: 'desc' }
    });

    console.log(`Total approved found: ${approved.length}`);
    for (const a of approved) {
        console.log(`- ID: ${a.id}`);
        console.log(`  Channel: ${a.targetChannel} | Format: ${a.contentFormat}`);
        console.log(`  Image URL: ${a.imageUrl}`);
        console.log(`  Created at: ${a.createdAt.toISOString()}`);
        console.log(`  Scheduled for: ${a.scheduledFor ? a.scheduledFor.toISOString().slice(0, 10) : 'null'}`);
    }
}

main().catch(console.error).finally(async () => {
    await prisma.$disconnect();
});
