import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim();
  
  if (!clientKey) {
    return new NextResponse('Variabile TIKTOK_CLIENT_KEY non configurata sul server.', { status: 500 });
  }

  // Determina la redirect URI in base a dove sta girando il server (locale o produzione)
  const host = request.headers.get('host') || 'www.floremoria.com';
  const protocol = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https';
  const redirectUri = `${protocol}://${host}/api/dashboard/tiktok/callback`;

  const scopes = [
    'user.info.basic',
    'video.publish',
    'video.upload'
  ].join(',');

  const authUrl = `https://www.tiktok.com/auth/authorize?client_key=${clientKey}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&response_type=code&state=floremoria-tiktok`;

  console.log(`[TikTok OAuth] Reindirizzamento dell'utente a: ${authUrl}`);
  return NextResponse.redirect(authUrl);
}
