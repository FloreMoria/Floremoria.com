import { parseTikTokOAuthError, parseTikTokTokenFields } from '@/lib/dashboard/tiktokOAuth';
import prisma from '@/lib/prisma';

export async function getOrRefreshTikTokToken(): Promise<{
  accessToken: string | null;
  openId: string | null;
}> {
  const dbAccessToken = await prisma.systemState.findUnique({ where: { key: 'tiktok_access_token' } });
  const dbRefreshToken = await prisma.systemState.findUnique({ where: { key: 'tiktok_refresh_token' } });
  const dbExpiresAt = await prisma.systemState.findUnique({ where: { key: 'tiktok_token_expires_at' } });
  const dbOpenId = await prisma.systemState.findUnique({ where: { key: 'tiktok_open_id' } });

  const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim();
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET?.trim();

  if (!dbAccessToken?.value || !dbRefreshToken?.value) {
    return {
      accessToken: process.env.TIKTOK_ACCESS_TOKEN?.trim() || null,
      openId: process.env.TIKTOK_OPEN_ID?.trim() || null,
    };
  }

  const expiresAt = Number(dbExpiresAt?.value || '0');
  const now = Date.now();

  if (expiresAt - now < 300_000) {
    console.log('[POSTMAN] TikTok access token in scadenza o scaduto. Tentativo di refresh...');

    if (!clientKey || !clientSecret) {
      console.warn(
        "[POSTMAN] TIKTOK_CLIENT_KEY o TIKTOK_CLIENT_SECRET mancanti nelle variabili d'ambiente. Impossibile rinfrescare."
      );
      return { accessToken: dbAccessToken.value, openId: dbOpenId?.value || null };
    }

    try {
      const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_key: clientKey,
          client_secret: clientSecret,
          grant_type: 'refresh_token',
          refresh_token: dbRefreshToken.value,
        }).toString(),
      });

      const payload = await res.json();
      const oauthError = parseTikTokOAuthError(payload);
      const tokens = parseTikTokTokenFields(payload);
      if (!res.ok || oauthError || !tokens) {
        console.error('[POSTMAN] Errore durante il refresh del token TikTok:', payload);
        throw new Error(oauthError || 'TikTok token refresh failed');
      }

      const {
        access_token: newAccess,
        refresh_token: newRefresh,
        expires_in: newExpiresIn,
        open_id: newOpenId,
        scope,
      } = tokens;

      const upserts = [
        prisma.systemState.upsert({
          where: { key: 'tiktok_access_token' },
          update: { value: newAccess },
          create: { key: 'tiktok_access_token', value: newAccess },
        }),
        prisma.systemState.upsert({
          where: { key: 'tiktok_refresh_token' },
          update: { value: newRefresh },
          create: { key: 'tiktok_refresh_token', value: newRefresh },
        }),
        prisma.systemState.upsert({
          where: { key: 'tiktok_token_expires_at' },
          update: { value: String(Date.now() + newExpiresIn * 1000) },
          create: { key: 'tiktok_token_expires_at', value: String(Date.now() + newExpiresIn * 1000) },
        }),
        prisma.systemState.upsert({
          where: { key: 'tiktok_open_id' },
          update: { value: newOpenId },
          create: { key: 'tiktok_open_id', value: newOpenId },
        }),
      ];

      if (scope) {
        upserts.push(
          prisma.systemState.upsert({
            where: { key: 'tiktok_granted_scopes' },
            update: { value: scope },
            create: { key: 'tiktok_granted_scopes', value: scope },
          })
        );
      }

      await prisma.$transaction(upserts);

      console.log('[POSTMAN] TikTok token rinfrescato con successo!');
      return { accessToken: newAccess, openId: newOpenId };
    } catch (err) {
      console.error('[POSTMAN] Refresh del token TikTok fallito. Ritorno vecchio token come fallback:', err);
      return { accessToken: dbAccessToken.value, openId: dbOpenId?.value || null };
    }
  }

  return { accessToken: dbAccessToken.value, openId: dbOpenId?.value || null };
}
