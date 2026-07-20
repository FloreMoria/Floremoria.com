import { NextRequest, NextResponse } from 'next/server';
import { getPinterestRedirectUri } from '@/lib/pinterest/oauth';
import { exchangePinterestAuthorizationCode } from '@/src/agents/platforms/pinterestTokenService';

export const runtime = 'nodejs';

function campaignsRedirect(request: NextRequest, query: string): NextResponse {
    const base = new URL(request.url);
    base.pathname = '/dashboard/campaigns';
    base.search = query;
    return NextResponse.redirect(base);
}

/**
 * GET /api/auth/pinterest/callback
 * Scambia code → access_token + refresh_token (continuous refresh) e salva in SystemState.
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (error) {
        console.error(`[Pinterest Callback] Errore OAuth: ${error} — ${errorDescription}`);
        return campaignsRedirect(
            request,
            `tab=PINTEREST&error=${encodeURIComponent(errorDescription || error)}`
        );
    }

    if (!code?.trim()) {
        return campaignsRedirect(request, 'tab=PINTEREST&error=no-code');
    }

    try {
        const redirectUri = getPinterestRedirectUri(request);
        console.log('[Pinterest Callback] Scambio authorization code…');
        await exchangePinterestAuthorizationCode({
            code: code.trim(),
            redirectUri,
        });
        console.log('[Pinterest Callback] Token salvati in SystemState.');
        return campaignsRedirect(request, 'tab=PINTEREST&success=pinterest-connected');
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[Pinterest Callback] Eccezione:', msg);
        return campaignsRedirect(
            request,
            `tab=PINTEREST&error=${encodeURIComponent(msg)}`
        );
    }
}
