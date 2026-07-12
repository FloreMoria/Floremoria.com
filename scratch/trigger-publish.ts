import { loadEnvFiles } from '../lib/loadEnvFiles';
import { runMarketingPublishPipeline } from '../lib/marketing/engine/publish';
import prisma from '../lib/prisma';

loadEnvFiles();

async function main() {
    console.log('--- Triggering publish pipeline ---');
    const result = await runMarketingPublishPipeline();
    console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
    console.error(err);
}).finally(async () => {
    await prisma.$disconnect();
});
