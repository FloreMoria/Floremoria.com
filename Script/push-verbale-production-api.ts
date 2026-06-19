/**
 * Sincronizza un verbale su Neon produzione via API admin (senza DATABASE_URL locale).
 *
 * Uso:
 *   VERBALE_FORCE_ISO=2026-06-19 npm run log:verbale:push-api
 */
import { readFileSync, existsSync } from 'node:fs';
import { loadEnvFiles } from '../lib/loadEnvFiles';
import { docsVerbalePath } from '../lib/verbali/paths';

loadEnvFiles();

async function main(): Promise<void> {
    const iso = process.env.VERBALE_FORCE_ISO?.trim() || '2026-06-19';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        throw new Error(`VERBALE_FORCE_ISO non valido: ${iso}`);
    }

    const adminKey = process.env.ADMIN_API_KEY?.trim();
    if (!adminKey) {
        throw new Error('ADMIN_API_KEY mancante in .env.local');
    }

    const baseUrl = (process.env.PRODUCTION_BASE_URL?.trim() || 'https://www.floremoria.com').replace(
        /\/$/,
        ''
    );

    const docsPath = docsVerbalePath(process.cwd(), iso);
    if (!existsSync(docsPath)) {
        throw new Error(`Verbale assente: ${docsPath}`);
    }

    const markdown = readFileSync(docsPath, 'utf8');
    const response = await fetch(`${baseUrl}/api/logs/sync-verbale`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-admin-key': adminKey,
        },
        body: JSON.stringify({ iso, markdown }),
    });

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
        throw new Error(
            `Sync API fallita (${response.status}): ${JSON.stringify(payload.error ?? payload)}`
        );
    }

    console.log(
        `✓ Produzione: ${payload.action} log id=${payload.id} tag=${payload.tag} (${iso})`
    );
}

main().catch((error) => {
    console.error('Push verbale produzione via API fallito:', error);
    process.exit(1);
});
