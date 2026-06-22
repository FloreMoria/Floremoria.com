/**
 * GET /api/admin/whatsapp/status
 *
 * Proxy autenticato (SUPER_ADMIN) per controllare lo stato di connessione
 * dell'istanza Evolution API (iPhone 12 FloreMoria).
 *
 * Risposta:
 *   { ok: true, state: "open" | "connecting" | "close" | "refused" }
 */
import { NextResponse } from 'next/server';
import { getEvolutionInstanceState } from '@/lib/whatsapp/evolutionApiClient';
import { requireSuperAdminApi } from '@/lib/superAdminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
    const guardResult = await requireSuperAdminApi();
    if (guardResult) return guardResult;

    const result = await getEvolutionInstanceState();

    if (!result.ok) {
        return NextResponse.json(
            { ok: false, error: result.error ?? 'evolution_api_error' },
            { status: 502 }
        );
    }

    return NextResponse.json({ ok: true, state: result.state });
}
