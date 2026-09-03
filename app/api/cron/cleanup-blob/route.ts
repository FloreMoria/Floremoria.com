/**
 * Cron: pulizia sicura Blob storage (store collegato al progetto via OIDC).
 *
 * Auth: Authorization Bearer CRON_SECRET | POSTMAN_CRON_SECRET | x-cron-key
 * Query: ?execute=1 per cancellare (default dry-run)
 */
import { NextResponse } from 'next/server';
import { formatMb, runSafeBlobCleanup } from '@/lib/blob/cleanupSafeBlobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function isAuthorized(request: Request): boolean {
    const secret =
        process.env.CRON_SECRET?.trim() || process.env.POSTMAN_CRON_SECRET?.trim();
    if (!secret) return false;
    const auth = request.headers.get('authorization') || '';
    if (auth.replace(/^Bearer\s+/i, '').trim() === secret) return true;
    return request.headers.get('x-cron-key')?.trim() === secret;
}

export async function GET(request: Request) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const execute = url.searchParams.get('execute') === '1';

    try {
        const report = await runSafeBlobCleanup({ dryRun: !execute });
        const under1Gb = report.residualBytesEstimate < 1024 * 1024 * 1024;
        const under800 = report.residualBytesEstimate < 800 * 1024 * 1024;

        console.info(
            `[cron/cleanup-blob] dryRun=${!execute} total=${formatMb(report.totalBytes)}MB ` +
                `candidates=${formatMb(report.candidateBytes)}MB deleted=${formatMb(report.deletedBytes)}MB ` +
                `residual~=${formatMb(report.residualBytesEstimate)}MB`,
        );

        return NextResponse.json({
            ok: true,
            storeId: process.env.BLOB_STORE_ID || null,
            execute,
            report: {
                ...report,
                totalMb: formatMb(report.totalBytes),
                candidateMb: formatMb(report.candidateBytes),
                deletedMb: formatMb(report.deletedBytes),
                residualMb: formatMb(report.residualBytesEstimate),
                under1Gb,
                under800Mb: under800,
            },
        });
    } catch (err) {
        console.error('[cron/cleanup-blob]', err);
        return NextResponse.json(
            {
                ok: false,
                error: err instanceof Error ? err.message : 'cleanup failed',
            },
            { status: 500 },
        );
    }
}

export async function POST(request: Request) {
    return GET(request);
}
