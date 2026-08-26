import { NextResponse } from 'next/server';
import { createYoudoxClient, YoudoxClient } from '@/lib/youdox/client';
import { loadYoudoxConfigFromEnv } from '@/lib/youdox/auth';
import { requireYoudoxApiAccess } from '@/lib/youdox/requireAccess';

/**
 * GET /api/v1/finance/youdox/health
 * Verifica config + GetToken (senza chiamate SOAP documentali).
 */
export async function GET(request: Request) {
    const access = await requireYoudoxApiAccess(request);
    if (!access.ok) return access.response;

    const config = loadYoudoxConfigFromEnv();
    if (!config) {
        return NextResponse.json(
            {
                ok: false,
                configured: false,
                error:
                    'Imposta YOUDOX_API_BASE_URL, YOUDOX_TOKEN_URL, YOUDOX_CLIENT_ID, YOUDOX_USERNAME, YOUDOX_PASSWORD',
            },
            { status: 503 }
        );
    }

    try {
        const client = createYoudoxClient({ config });
        const token = await client.getAccessToken();
        return NextResponse.json({
            ok: true,
            configured: true,
            dryRun: process.env.YOUDOX_DRY_RUN === 'true',
            tokenPreview: `${token.slice(0, 6)}…`,
            services: {
                exchange: client.serviceUrl('ExchangeService'),
                invoices: client.serviceUrl('InvoicesService'),
            },
            folders: YoudoxClient.sftpFolderMap(),
            via: access.via,
        });
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Errore YouDOX';
        console.error('[youdox/health]', message);
        return NextResponse.json({ ok: false, configured: true, error: message }, { status: 502 });
    }
}
