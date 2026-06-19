/**
 * Inserisce un verbale su produzione via webhook /api/logs/update (endpoint già deployato).
 *
 * Uso:
 *   VERBALE_FORCE_ISO=2026-06-19 FLOREMORIA_WEBHOOK_KEY=... npm run log:verbale:push-webhook
 */
import { readFileSync, existsSync } from 'node:fs';
import { loadEnvFiles } from '../lib/loadEnvFiles';
import { docsVerbalePath, docsVerbaleRel } from '../lib/verbali/paths';

loadEnvFiles();

async function main(): Promise<void> {
    const iso = process.env.VERBALE_FORCE_ISO?.trim() || '2026-06-19';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        throw new Error(`VERBALE_FORCE_ISO non valido: ${iso}`);
    }

    const webhookKey = process.env.FLOREMORIA_WEBHOOK_KEY?.trim();
    if (!webhookKey) {
        throw new Error('FLOREMORIA_WEBHOOK_KEY mancante (Vercel production env)');
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
    const [y, m, d] = iso.split('-').map(Number);
    const names = [
        'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
        'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
    ];
    const topic = `Verbale operativo ${d} ${names[m - 1]} ${y} (Regola Aurea)`;
    const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();

    const response = await fetch(`${baseUrl}/api/logs/update`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': webhookKey,
        },
        body: JSON.stringify({
            upsert: true,
            agent_name: 'BARBARA',
            date: `${iso}T12:00:00.000Z`,
            status: topic,
            tag: `#BARBARA_VERBALE_GIORNO_${iso}`,
            log_content: markdown,
            key_prompt: 'BARBARA / VITO / PETRA — Consolidamento sessione e sync dashboard Neon',
            achieved_results:
                'Verbale BARBARA sincronizzato su Obsidian e floremoria_logs (dashboard admin).',
            source_rel: docsVerbaleRel(iso),
        }),
    });

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
        throw new Error(
            `Webhook fallito (${response.status}): ${JSON.stringify(payload.error ?? payload)}`
        );
    }

    console.log(
        `✓ Produzione webhook: log_id=${payload.log_id} ${title ? `— ${title}` : ''}`
    );
}

main().catch((error) => {
    console.error('Push verbale produzione via webhook fallito:', error);
    process.exit(1);
});
