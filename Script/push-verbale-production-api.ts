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
    const payload = { iso, markdown };

    const endpoints = [`${baseUrl}/api/logs/sync-verbale`, `${baseUrl}/api/admin/sync-verbale`];
    let lastError = 'nessun endpoint raggiungibile';

    for (const endpoint of endpoints) {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-key': adminKey,
            },
            body: JSON.stringify(payload),
        });

        const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        if (response.ok) {
            console.log(
                `✓ Produzione (${endpoint}): ${body.action} log id=${body.id} tag=${body.tag} (${iso})`
            );
            return;
        }

        if (response.status === 404) {
            lastError = `${endpoint} non ancora deployato`;
            continue;
        }

        throw new Error(
            `Sync API fallita (${response.status} @ ${endpoint}): ${JSON.stringify(body.error ?? body)}`
        );
    }

    throw new Error(`Sync API fallita: ${lastError}. Attendi il deploy Vercel e riprova.`);
}

main().catch((error) => {
    console.error('Push verbale produzione via API fallito:', error);
    process.exit(1);
});
