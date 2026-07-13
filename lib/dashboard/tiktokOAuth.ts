const TIKTOK_PRODUCTION_REDIRECT_URI = 'https://www.floremoria.com/api/dashboard/tiktok/callback';

export interface TikTokTokenFields {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  open_id: string;
  scope?: string;
}

/** Scope minimi per Content Posting API (Direct Post). */
export const TIKTOK_PUBLISH_SCOPES = ['video.publish', 'video.upload'] as const;

export const TIKTOK_GRANTED_SCOPES_KEY = 'tiktok_granted_scopes';

/** Redirect URI canonica: deve coincidere esattamente con il portale TikTok Developer. */
export function getTikTokRedirectUri(request: Request): string {
  const host = (
    request.headers.get('x-forwarded-host') ||
    request.headers.get('host') ||
    ''
  )
    .split(',')[0]
    .trim()
    .toLowerCase();
  const hostname = host.split(':')[0];

  if (hostname.includes('localhost') || hostname === '127.0.0.1') {
    return `http://${host}/api/dashboard/tiktok/callback`;
  }

  return TIKTOK_PRODUCTION_REDIRECT_URI;
}

/**
 * Scope OAuth richiesti al login.
 * Default: solo user.info.basic (compatibile con Sandbox senza Content Posting API).
 * In produzione, dopo aver abilitato Direct Post: TIKTOK_OAUTH_SCOPES=user.info.basic,video.publish,video.upload
 */
export function getTikTokOAuthScopes(): string {
  const fromEnv = process.env.TIKTOK_OAUTH_SCOPES?.trim();
  if (fromEnv) return fromEnv;
  return 'user.info.basic';
}

export function parseTikTokGrantedScopes(scopeValue: string | null | undefined): string[] {
  if (!scopeValue?.trim()) return [];
  return scopeValue
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function hasTikTokPublishScopes(scopeValue: string | null | undefined): boolean {
  const granted = new Set(parseTikTokGrantedScopes(scopeValue));
  return TIKTOK_PUBLISH_SCOPES.every((required) => granted.has(required));
}

export function getTikTokPublishScopeHint(): string {
  return TIKTOK_PUBLISH_SCOPES.join(',');
}

export function formatTikTokScopeAuthorizationError(): string {
  return (
    'Permessi TikTok insufficienti per la pubblicazione. Sul portale Developer abilita Content Posting API ' +
    '(Direct Post), imposta su Vercel TIKTOK_OAUTH_SCOPES=user.info.basic,video.publish,video.upload, ' +
    'poi scollega e riconnetti il profilo dalla dashboard.'
  );
}

export function isTikTokScopeAuthorizationError(message: string): boolean {
  return /did not authorize the scope|scope required|insufficient.*scope/i.test(message);
}

export function buildTikTokAuthorizeUrl(
  clientKey: string,
  redirectUri: string,
  scopes: string,
  state = 'floremoria-tiktok'
): string {
  const params = new URLSearchParams({
    client_key: clientKey,
    redirect_uri: redirectUri,
    scope: scopes,
    response_type: 'code',
    state,
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
}

export function parseTikTokOAuthError(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  const err = root.error;
  if (!err) return null;
  if (typeof err === 'string') return err;
  if (typeof err === 'object' && err !== null) {
    const e = err as Record<string, unknown>;
    if (typeof e.message === 'string' && e.message.trim()) return e.message;
    if (typeof e.code === 'string' && e.code.trim()) return e.code;
  }
  return 'TikTok OAuth error';
}

export function parseTikTokTokenFields(payload: unknown): TikTokTokenFields | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  const data = (root.data && typeof root.data === 'object' ? root.data : root) as Record<
    string,
    unknown
  >;

  const access_token = typeof data.access_token === 'string' ? data.access_token : null;
  const refresh_token = typeof data.refresh_token === 'string' ? data.refresh_token : null;
  const open_id = typeof data.open_id === 'string' ? data.open_id : null;
  const expires_in =
    typeof data.expires_in === 'number' ? data.expires_in : Number(data.expires_in);
  const scope = typeof data.scope === 'string' ? data.scope : undefined;

  if (!access_token || !refresh_token || !open_id || !Number.isFinite(expires_in)) {
    return null;
  }

  return { access_token, refresh_token, expires_in, open_id, scope };
}
