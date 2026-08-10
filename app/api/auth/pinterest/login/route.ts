import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { isDashboardAdminRole } from '@/lib/superAdmin';
import {
    buildPinterestAuthorizeUrl,
    getPinterestAppId,
    getPinterestOAuthScopes,
    getPinterestRedirectUri,
} from '@/lib/pinterest/oauth';

export const runtime = 'nodejs';

/**
 * GET /api/auth/pinterest/login
 * Avvia OAuth Pinterest v5 (solo staff dashboard).
 */
export async function GET(request: Request) {
    const cookieStore = await cookies();
    const role = cookieStore.get('fm_user_role')?.value;
    if (!isDashboardAdminRole(role)) {
        return NextResponse.json(
            { success: false, message: 'Non autorizzato. Solo staff dashboard.' },
            { status: 403 }
        );
    }

    const clientId = getPinterestAppId();
    if (!clientId) {
        return new NextResponse('PINTEREST_APP_ID non configurato sul server.', { status: 500 });
    }

    const redirectUri = getPinterestRedirectUri(request);
    const scope = getPinterestOAuthScopes();
    const state = `fm_${Date.now().toString(36)}`;

    const authUrl = buildPinterestAuthorizeUrl({
        clientId,
        redirectUri,
        scope,
        state,
    });

    console.log(`[Pinterest OAuth] redirect_uri=${redirectUri} scope=${scope}`);
    return NextResponse.redirect(authUrl);
}
