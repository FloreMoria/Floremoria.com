import {
  logTikTokApiVerbal,
  parseTikTokOAuthError,
  parseTikTokTokenFields,
} from '@/lib/dashboard/tiktokOAuth';
import prisma from '@/lib/prisma';

export async function getStoredTikTokGrantedScopes(): Promise<string | null> {
  const row = await prisma.systemState.findUnique({
    where: { key: 'tiktok_granted_scopes' },
  });
  return row?.value?.trim() || null;
}

export type TikTokTokenResult = {
  accessToken: string | null;
  openId: string | null;
  /** Epoch ms di scadenza se nota. */
  expiresAt?: number | null;
  /** Errore leggibile (token scaduto / refresh fallito). */
  tokenError?: string | null;
};

const TOKEN_REFRESH_SKEW_MS = 300_000;

/**
 * Legge / rinnova l'access token TikTok da SystemState.
 * Con requireFresh=true non restituisce un token già scaduto se il refresh fallisce.
 */
export async function getOrRefreshTikTokToken(options?: {
  requireFresh?: boolean;
}): Promise<TikTokTokenResult> {
  const requireFresh = options?.requireFresh === true;

  const dbAccessToken = await prisma.systemState.findUnique({
    where: { key: 'tiktok_access_token' },
  });
  const dbRefreshToken = await prisma.systemState.findUnique({
    where: { key: 'tiktok_refresh_token' },
  });
  const dbExpiresAt = await prisma.systemState.findUnique({
    where: { key: 'tiktok_token_expires_at' },
  });
  const dbOpenId = await prisma.systemState.findUnique({
    where: { key: 'tiktok_open_id' },
  });

  const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim();
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET?.trim();

  if (!dbAccessToken?.value || !dbRefreshToken?.value) {
    const envToken = process.env.TIKTOK_ACCESS_TOKEN?.trim() || null;
    if (!envToken && requireFresh) {
      return {
        accessToken: null,
        openId: null,
        tokenError:
          'Access Token TikTok assente in SystemState/DB. Riconnetti l\'account da Command Center → TikTok.',
      };
    }
    return {
      accessToken: envToken,
      openId: process.env.TIKTOK_OPEN_ID?.trim() || null,
      expiresAt: null,
    };
  }

  const expiresAt = Number(dbExpiresAt?.value || '0');
  const now = Date.now();
  const needsRefresh = !Number.isFinite(expiresAt) || expiresAt - now < TOKEN_REFRESH_SKEW_MS;

  if (!needsRefresh) {
    return {
      accessToken: dbAccessToken.value,
      openId: dbOpenId?.value || null,
      expiresAt,
    };
  }

  console.log('[POSTMAN] TikTok access token in scadenza o scaduto. Tentativo di refresh...');
  logTikTokApiVerbal('TOKEN_REFRESH_START', {
    expiresAt,
    now,
    skewMs: TOKEN_REFRESH_SKEW_MS,
  });

  if (!clientKey || !clientSecret) {
    const msg =
      'Token TikTok scaduto/in scadenza e TIKTOK_CLIENT_KEY/SECRET mancanti: impossibile rinnovarlo. Riautorizza TikTok.';
    console.warn(`[POSTMAN] ${msg}`);
    if (requireFresh) {
      return {
        accessToken: null,
        openId: dbOpenId?.value || null,
        expiresAt,
        tokenError: msg,
      };
    }
    return {
      accessToken: dbAccessToken.value,
      openId: dbOpenId?.value || null,
      expiresAt,
      tokenError: msg,
    };
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
      signal: AbortSignal.timeout(30_000),
    });

    const payload = await res.json().catch(() => null);
    const oauthError = parseTikTokOAuthError(payload);
    const tokens = parseTikTokTokenFields(payload);
    if (!res.ok || oauthError || !tokens) {
      console.error('[POSTMAN] Errore durante il refresh del token TikTok:', payload);
      throw new Error(oauthError || `TikTok token refresh failed (HTTP ${res.status})`);
    }

    const {
      access_token: newAccess,
      refresh_token: newRefresh,
      expires_in: newExpiresIn,
      open_id: newOpenId,
      scope,
    } = tokens;

    const newExpiresAt = Date.now() + newExpiresIn * 1000;
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
        update: { value: String(newExpiresAt) },
        create: { key: 'tiktok_token_expires_at', value: String(newExpiresAt) },
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
    logTikTokApiVerbal('TOKEN_REFRESH_OK', { expiresAt: newExpiresAt });
    return { accessToken: newAccess, openId: newOpenId, expiresAt: newExpiresAt };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const isTimeout = /timeout|aborted|AbortError/i.test(detail);
    const msg = isTimeout
      ? 'Timeout durante il rinnovo dell\'Access Token TikTok. Riprova o riautorizza l\'account.'
      : `Rinnovo Access Token TikTok fallito (${detail}). Riautorizza l'account da Command Center → TikTok.`;
    console.error('[POSTMAN] Refresh del token TikTok fallito:', err);
    logTikTokApiVerbal('TOKEN_REFRESH_FAIL', { detail, requireFresh });

    if (requireFresh || expiresAt <= now) {
      return {
        accessToken: null,
        openId: dbOpenId?.value || null,
        expiresAt,
        tokenError: msg,
      };
    }

    return {
      accessToken: dbAccessToken.value,
      openId: dbOpenId?.value || null,
      expiresAt,
      tokenError: msg,
    };
  }
}
