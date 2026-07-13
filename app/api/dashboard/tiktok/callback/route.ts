import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  if (error) {
    console.error(`[TikTok Callback] Errore da TikTok: ${error} - ${errorDescription}`);
    return NextResponse.redirect(new URL('/dashboard/campaigns?tab=TIKTOK&error=' + encodeURIComponent(errorDescription || error), request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/dashboard/campaigns?tab=TIKTOK&error=no-code', request.url));
  }

  const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim();
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET?.trim();

  if (!clientKey || !clientSecret) {
    return new NextResponse('Variabili TIKTOK_CLIENT_KEY o TIKTOK_CLIENT_SECRET non configurate.', { status: 500 });
  }

  // Costruisci la stessa redirect URI usata nell'auth request
  const host = request.headers.get('host') || 'www.floremoria.com';
  const protocol = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https';
  const redirectUri = `${protocol}://${host}/api/dashboard/tiktok/callback`;

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
    if (!res.ok || payload.error) {
      console.error('[TikTok Callback] Errore scambio token:', payload.error || payload);
      return NextResponse.redirect(new URL('/dashboard/campaigns?tab=TIKTOK&error=' + encodeURIComponent(payload.error?.message || 'Token exchange failed'), request.url));
    }

    const { access_token, refresh_token, expires_in, open_id } = payload;

    // Salva o aggiorna i valori in SystemState nel database
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
    return NextResponse.redirect(new URL('/dashboard/campaigns?tab=TIKTOK&success=tiktok-connected', request.url));
  } catch (err) {
    console.error('[TikTok Callback] Eccezione durante scambio token:', err);
    return NextResponse.redirect(new URL('/dashboard/campaigns?tab=TIKTOK&error=exception', request.url));
  }
}
