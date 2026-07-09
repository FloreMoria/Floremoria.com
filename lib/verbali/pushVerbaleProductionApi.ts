/**
 * Sincronizza verbale su Neon produzione via API admin (senza DATABASE_URL locale).
 */
import { readFileSync, existsSync } from 'node:fs';
import { loadEnvFiles } from '../loadEnvFiles';
import { docsVerbalePath } from './paths';

export async function pushVerbaleToProductionApi(
    cwd: string,
    iso: string
): Promise<{ id: unknown; tag: unknown; action: unknown }> {
    loadEnvFiles(cwd);

    const adminKey = process.env.ADMIN_API_KEY?.trim();
    const webhookKey = process.env.FLOREMORIA_WEBHOOK_KEY?.trim();
    if (!adminKey && !webhookKey) {
        throw new Error(
            'ADMIN_API_KEY o FLOREMORIA_WEBHOOK_KEY mancante in .env.local (il pull Vercel non include segreti sensibili).'
        );
    }

    const baseUrl = (process.env.PRODUCTION_BASE_URL?.trim() || 'https://www.floremoria.com').replace(
        /\/$/,
        ''
    );

    const docsPath = docsVerbalePath(cwd, iso);
    if (!existsSync(docsPath)) {
        throw new Error(`Verbale assente: ${docsPath}`);
    }

    const markdown = readFileSync(docsPath, 'utf8');
    const payload = { iso, markdown };

    const endpoints = [`${baseUrl}/api/logs/sync-verbale`, `${baseUrl}/api/admin/sync-verbale`];
    const authAttempts: Array<{ headers: Record<string, string>; label: string }> = [];
    if (adminKey) authAttempts.push({ headers: { 'x-admin-key': adminKey }, label: 'x-admin-key' });
    if (webhookKey) authAttempts.push({ headers: { 'x-api-key': webhookKey }, label: 'x-api-key' });

    let lastError = 'nessun endpoint raggiungibile';

    for (const endpoint of endpoints) {
        for (const auth of authAttempts) {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...auth.headers,
                },
                body: JSON.stringify(payload),
            });

            const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
            if (response.ok) {
                return {
                    action: body.action,
                    id: body.id,
                    tag: body.tag,
                };
            }

            if (response.status === 401) {
                lastError = `401 con ${auth.label} — allinea chiavi: npm run verbali:verify-keys`;
                continue;
            }

            if (response.status === 404) {
                lastError = `${endpoint} non ancora deployato`;
                break;
            }

            throw new Error(
                `Sync API fallita (${response.status} @ ${endpoint}): ${JSON.stringify(body.error ?? body)}`
            );
        }
    }

    throw new Error(`Sync API fallita: ${lastError}. Attendi il deploy Vercel e riprova.`);
}
