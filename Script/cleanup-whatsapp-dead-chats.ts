/**
 * Pulizia chat WhatsApp morte/duplicate su DB produzione.
 *
 * Uso:
 *   npx tsx Script/cleanup-whatsapp-dead-chats.ts --dry-run
 *   npx tsx Script/cleanup-whatsapp-dead-chats.ts --apply
 */
import { resolveProductionDatabaseUrl } from '@/lib/database/resolveProductionDatabaseUrl';
import { cleanupDeadAndDuplicateChatSessions } from '@/lib/whatsapp/cleanupChatSessions';

async function main() {
    const apply = process.argv.includes('--apply');
    const dryRun = !apply;

    const productionUrl = resolveProductionDatabaseUrl();
    if (productionUrl) {
        process.env.DATABASE_URL = productionUrl;
        console.info('[cleanup-chats] DATABASE_URL → produzione Neon');
    } else if (!process.env.DATABASE_URL?.trim()) {
        console.error('[cleanup-chats] Nessun DATABASE_URL produzione o locale.');
        process.exit(2);
    } else {
        console.info('[cleanup-chats] Uso DATABASE_URL corrente (locale/fallback)');
    }

    console.info(`[cleanup-chats] mode=${dryRun ? 'DRY-RUN' : 'APPLY'}`);
    const result = await cleanupDeadAndDuplicateChatSessions({ dryRun });
    console.info(JSON.stringify(result, null, 2));
    process.exit(0);
}

main().catch((err) => {
    console.error('[cleanup-chats] FATAL', err);
    process.exit(1);
});
