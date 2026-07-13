import { NextResponse } from 'next/server';
import {
  buildTikTokAuthorizeUrl,
  getTikTokOAuthScopes,
  getTikTokRedirectUri,
} from '@/lib/dashboard/tiktokOAuth';

export async function GET(request: Request) {
  const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim();

  if (!clientKey) {
    return new NextResponse('Variabile TIKTOK_CLIENT_KEY non configurata sul server.', { status: 500 });
  }

  const redirectUri = getTikTokRedirectUri(request);
  const scopes = getTikTokOAuthScopes();
  const authUrl = buildTikTokAuthorizeUrl(clientKey, redirectUri, scopes);

  console.log(`[TikTok OAuth] redirect_uri=${redirectUri} scopes=${scopes}`);
  console.log(`[TikTok OAuth] Reindirizzamento dell'utente a: ${authUrl}`);
  return NextResponse.redirect(authUrl);
}
