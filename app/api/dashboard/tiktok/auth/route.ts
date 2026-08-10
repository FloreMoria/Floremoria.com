import { NextResponse } from 'next/server';
import {
  TIKTOK_REQUIRED_OAUTH_SCOPES,
  buildTikTokAuthorizeUrl,
  getTikTokOAuthScopes,
  getTikTokRedirectUri,
} from '@/lib/dashboard/tiktokOAuth';

export async function GET(request: Request) {
  const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim();

  if (!clientKey) {
    return new NextResponse('Variabile TIKTOK_CLIENT_KEY non configurata sul server.', {
      status: 500,
    });
  }

  const redirectUri = getTikTokRedirectUri(request);
  const scopes = getTikTokOAuthScopes();
  const authUrl = buildTikTokAuthorizeUrl(clientKey, redirectUri, scopes);

  // Verbale OAuth: conferma esplicita degli scope obbligatori nell'URL.
  const scopeList = scopes.split(',').map((x) => x.trim()).filter(Boolean);
  const missingRequired = TIKTOK_REQUIRED_OAUTH_SCOPES.filter((s) => !scopeList.includes(s));
  console.log(
    `[TikTok OAuth] redirect_uri=${redirectUri} scopes=${scopes} required_ok=${missingRequired.length === 0}`
  );
  if (missingRequired.length) {
    console.error(
      `[TikTok OAuth] Scope obbligatori assenti dall'URL: ${missingRequired.join(',')}`
    );
  }
  console.log(`[TikTok OAuth] Reindirizzamento dell'utente a: ${authUrl}`);
  return NextResponse.redirect(authUrl);
}
