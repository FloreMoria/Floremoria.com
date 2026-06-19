/**
 * Verifica allineamento chiavi sync verbali (locale ↔ produzione Vercel).
 */
import { loadEnvFiles } from '../lib/loadEnvFiles';

loadEnvFiles();

type CheckResult = {
    name: string;
    ok: boolean;
    status?: number;
    detail: string;
};

async function probeGet(
    baseUrl: string,
    headers: Record<string, string>,
    label: string
): Promise<CheckResult | null> {
    const url = `${baseUrl.replace(/\/$/, '')}/api/logs/sync-verbale`;
    const response = await fetch(url, { method: 'GET', headers });
    if (response.status === 405) return null;

    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (response.status === 401) {
        return { name: label, ok: false, status: 401, detail: '401 — chiave non allineata con Vercel' };
    }
    if (response.ok && body.auth === 'valid') {
        return { name: label, ok: true, status: response.status, detail: 'Autenticazione OK (GET)' };
    }
    return { name: label, ok: false, status: response.status, detail: JSON.stringify(body.error ?? body) };
}

async function probePostDryRun(
    baseUrl: string,
    headers: Record<string, string>,
    label: string
): Promise<CheckResult> {
    const url = `${baseUrl.replace(/\/$/, '')}/api/logs/sync-verbale`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify({ dryRun: true }),
        });
        const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

        if (response.status === 401) {
            return { name: label, ok: false, status: 401, detail: '401 — chiave non allineata con Vercel' };
        }
        // Auth prima della validazione ISO (deploy senza dryRun)
        if (response.status === 400 && String(body.error ?? '').includes('iso')) {
            return { name: label, ok: true, status: 400, detail: 'Autenticazione OK (POST sync-verbale)' };
        }
        if (response.ok && (body.auth === 'valid' || body.dryRun === true)) {
            return { name: label, ok: true, status: response.status, detail: 'Autenticazione OK (POST dryRun)' };
        }
        if (response.status === 405) {
            return {
                name: label,
                ok: false,
                status: 405,
                detail: 'Endpoint non deployato — attendi deploy Vercel da main',
            };
        }
        return { name: label, ok: false, status: response.status, detail: JSON.stringify(body.error ?? body) };
    } catch (error) {
        return {
            name: label,
            ok: false,
            detail: error instanceof Error ? error.message : String(error),
        };
    }
}

async function probeLogsUpdateAuth(
    baseUrl: string,
    headers: Record<string, string>,
    label: string
): Promise<CheckResult> {
    const url = `${baseUrl.replace(/\/$/, '')}/api/logs/update`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({}),
    });
    if (response.status === 401) {
        return { name: label, ok: false, status: 401, detail: '401 — webhook key non allineata' };
    }
    // Auth passa prima della validazione campi → 400 = chiave OK
    if (response.status === 400) {
        return { name: label, ok: true, status: 400, detail: 'Autenticazione OK (/api/logs/update)' };
    }
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { name: label, ok: false, status: response.status, detail: JSON.stringify(body.error ?? body) };
}

async function probeAuth(
    baseUrl: string,
    headers: Record<string, string>,
    label: string
): Promise<CheckResult> {
    const getResult = await probeGet(baseUrl, headers, `${label} (GET)`);
    if (getResult?.ok) return getResult;
    return probePostDryRun(baseUrl, headers, label);
}

async function main(): Promise<void> {
    const baseUrl =
        process.env.VERBALI_SYNC_PRODUCTION_URL?.trim() ||
        process.env.PRODUCTION_BASE_URL?.trim() ||
        'https://www.floremoria.com';

    const adminKey = process.env.ADMIN_API_KEY?.trim();
    const webhookKey = process.env.FLOREMORIA_WEBHOOK_KEY?.trim();

    console.log('=== Verifica sync verbali FloreMoria ===\n');
    console.log(`Target: ${baseUrl}`);
    console.log(`ADMIN_API_KEY locale: ${adminKey ? `${adminKey.slice(0, 3)}… (${adminKey.length} char)` : 'ASSENTE'}`);
    console.log(
        `FLOREMORIA_WEBHOOK_KEY locale: ${webhookKey ? `${webhookKey.slice(0, 6)}… (${webhookKey.length} char)` : 'ASSENTE'}`
    );
    console.log('');

    const checks: CheckResult[] = [];

    if (adminKey) {
        checks.push(await probeAuth(baseUrl, { 'x-admin-key': adminKey }, 'sync-verbale x-admin-key'));
    } else {
        checks.push({ name: 'ADMIN_API_KEY', ok: false, detail: 'Manca in .env.local' });
    }

    if (webhookKey) {
        checks.push(await probeAuth(baseUrl, { 'x-api-key': webhookKey }, 'sync-verbale x-api-key'));
        checks.push(
            await probeLogsUpdateAuth(baseUrl, { 'x-api-key': webhookKey }, 'logs/update x-api-key (legacy)')
        );
    } else {
        checks.push({ name: 'FLOREMORIA_WEBHOOK_KEY', ok: false, detail: 'Manca in .env.local' });
    }

    let exitCode = 0;
    const anyOk = checks.some((c) => c.ok);
    for (const c of checks) {
        console.log(`${c.ok ? '✓' : '✗'} ${c.name}`);
        console.log(`  ${c.detail}\n`);
    }

    if (!anyOk) exitCode = 1;

    if (exitCode !== 0) {
        console.log(`Allineamento:
  1. Vercel → floremoria → Settings → Environment Variables (Production)
  2. Copia ADMIN_API_KEY e FLOREMORIA_WEBHOOK_KEY in .env.local (valori identici)
  3. npm run verbali:verify-keys
`);
    } else {
        console.log('Almeno una chiave funziona su produzione. Push automatico: npm run log:verbale:push-api');
        const adminFail = checks.find((c) => c.name.includes('admin') && !c.ok);
        if (adminFail) {
            console.log(
                '\nNota ADMIN_API_KEY: valore locale ≠ Vercel. Allinea in Vercel Production o aggiorna .env.local.'
            );
        }
    }

    process.exit(exitCode);
}

main();
