/**
 * Sincronizza un verbale su Neon produzione via API admin (senza DATABASE_URL locale).
 *
 * Uso:
 *   VERBALE_FORCE_ISO=2026-06-19 npm run log:verbale:push-api
 */
import { pushVerbaleToProductionApi } from '../lib/verbali/pushVerbaleProductionApi';

async function main(): Promise<void> {
    const iso = process.env.VERBALE_FORCE_ISO?.trim() || '2026-06-19';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        throw new Error(`VERBALE_FORCE_ISO non valido: ${iso}`);
    }

    const baseUrl = (process.env.PRODUCTION_BASE_URL?.trim() || 'https://www.floremoria.com').replace(
        /\/$/,
        ''
    );

    const result = await pushVerbaleToProductionApi(process.cwd(), iso);
    console.log(
        `✓ Produzione (${baseUrl}/api/logs/sync-verbale): ${result.action} log id=${result.id} tag=${result.tag} (${iso})`
    );
}

main().catch((error) => {
    console.error('Push verbale produzione via API fallito:', error);
    process.exit(1);
});
