import { NextRequest, NextResponse } from 'next/server';
import {
  getTikTokRedirectUri,
  parseTikTokOAuthError,
  parseTikTokTokenFields,
} from '@/lib/dashboard/tiktokOAuth';
import prisma from '@/lib/prisma';

function campaignsRedirect(request: NextRequest, query: string): NextResponse {
  const base = new URL(request.url);
  base.pathname = '/dashboard/campaigns';
  base.search = query;
  return NextResponse.redirect(base);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  if (error) {
    console.error(`[TikTok Callback] Errore da TikTok: ${error} - ${errorDescription}`);
    return campaignsRedirect(
      request,
      `tab=TIKTOK&error=${encodeURIComponent(errorDescription || error)}`
    );
  }

  if (!code) {
    return campaignsRedirect(request, 'tab=TIKTOK&error=no-code');
  }

  const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim();
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET?.trim();

  if (!clientKey || !clientSecret) {
    return new NextResponse('Variabili TIKTOK_CLIENT_KEY o TIKTOK_CLIENT_SECRET non configurate.', {
      status: 500,
    });
  }

  const redirectUri = getTikTokRedirectUri(request);

  try {
    console.log('[TikTok Callback] Scambio codice di autorizzazione per tokens...');

    const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }).toString(),
    });

    const payload = await res.json();
    const oauthError = parseTikTokOAuthError(payload);
    if (!res.ok || oauthError) {
      console.error('[TikTok Callback] Errore scambio token:', payload);
      return campaignsRedirect(
        request,
        `tab=TIKTOK&error=${encodeURIComponent(oauthError || 'Token exchange failed')}`
      );
    }

    const tokens = parseTikTokTokenFields(payload);
    if (!tokens) {
      console.error('[TikTok Callback] Risposta token non valida:', payload);
      return campaignsRedirect(request, 'tab=TIKTOK&error=invalid-token-response');
    }

    const { access_token, refresh_token, expires_in, open_id } = tokens;

    await prisma.$transaction([
      prisma.systemState.upsert({
        where: { key: 'tiktok_access_token' },
        update: { value: access_token },
        create: { key: 'tiktok_access_token', value: access_token },
      }),
      prisma.systemState.upsert({
        where: { key: 'tiktok_refresh_token' },
        update: { value: refresh_token },
        create: { key: 'tiktok_refresh_token', value: refresh_token },
      }),
      prisma.systemState.upsert({
        where: { key: 'tiktok_token_expires_at' },
        update: { value: String(Date.now() + expires_in * 1000) },
        create: { key: 'tiktok_token_expires_at', value: String(Date.now() + expires_in * 1000) },
      }),
      prisma.systemState.upsert({
        where: { key: 'tiktok_open_id' },
        update: { value: open_id },
        create: { key: 'tiktok_open_id', value: open_id },
      }),
    ]);

    console.log('[TikTok Callback] Token TikTok salvati con successo in SystemState!');
    return campaignsRedirect(request, 'tab=TIKTOK&success=tiktok-connected');
  } catch (err) {
    console.error('[TikTok Callback] Eccezione durante scambio token:', err);
    return campaignsRedirect(request, 'tab=TIKTOK&error=exception');
  }
}
