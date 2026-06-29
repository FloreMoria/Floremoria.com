/**
 * GET /api/admin/whatsapp/status
 *
 * Stato connessione Meta WhatsApp Cloud API (SUPER_ADMIN).
 */
import { NextResponse } from 'next/server';
import { getWhatsAppConnectionState } from '@/lib/whatsapp/metaCloudApiClient';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
    const guardResult = await requireDashboardAdmin();
    if (!guardResult.ok) return guardResult.response;

    const result = await getWhatsAppConnectionState();

    if (!result.ok) {
        return NextResponse.json(
            {
                ok: false,
                provider: 'meta_cloud',
                error: result.error ?? 'meta_api_error',
                ...(result.missingEnv?.length ? { missingEnv: result.missingEnv } : {}),
            },
            { status: result.error === 'not_configured' ? 503 : 502 }
        );
    }

    return NextResponse.json({
        ok: true,
        provider: 'meta_cloud',
        state: result.state,
        displayPhoneNumber: result.displayPhoneNumber,
    });
}
