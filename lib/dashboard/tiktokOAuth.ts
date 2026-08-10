const TIKTOK_PRODUCTION_REDIRECT_URI = 'https://www.floremoria.com/api/dashboard/tiktok/callback';

export interface TikTokTokenFields {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  open_id: string;
  scope?: string;
}

/** Scope Content Posting — Direct Post e/o Upload (inbox). */
export const TIKTOK_PUBLISH_SCOPES = ['video.publish', 'video.upload'] as const;

/** Scope sempre richiesti nell'URL di autorizzazione OAuth. */
export const TIKTOK_REQUIRED_OAUTH_SCOPES = [
  'user.info.basic',
  'video.publish',
  'video.upload',
] as const;

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

/** Default esplicito: user.info.basic + video.publish + video.upload. */
export const TIKTOK_DEFAULT_OAUTH_SCOPES = TIKTOK_REQUIRED_OAUTH_SCOPES.join(',');

/**
 * Scope OAuth per /v2/auth/authorize/.
 * Unisce sempre gli scope obbligatori con eventuale override TIKTOK_OAUTH_SCOPES
 * (l'env non può rimuovere basic/publish/upload).
 */
export function getTikTokOAuthScopes(): string {
  const fromEnv = process.env.TIKTOK_OAUTH_SCOPES?.trim();
  const merged = new Set<string>([
    ...TIKTOK_REQUIRED_OAUTH_SCOPES,
    ...parseTikTokGrantedScopes(fromEnv),
  ]);

  const ordered: string[] = [];
  for (const required of TIKTOK_REQUIRED_OAUTH_SCOPES) {
    if (merged.has(required)) {
      ordered.push(required);
      merged.delete(required);
    }
  }
  for (const extra of merged) {
    ordered.push(extra);
  }
  return ordered.join(',');
}

export function parseTikTokGrantedScopes(scopeValue: string | null | undefined): string[] {
  if (!scopeValue?.trim()) return [];
  return scopeValue
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export type TikTokPublishCapability = {
  hasBasicInfo: boolean;
  /** Direct Post API (`/v2/post/publish/video/init/`). */
  canDirectPost: boolean;
  /** Upload to inbox (`/v2/post/publish/inbox/video/init/`). */
  canInboxUpload: boolean;
  /** Almeno un percorso di pubblicazione video. */
  canPublishVideo: boolean;
};

export function getTikTokPublishCapability(
  scopeValue: string | null | undefined
): TikTokPublishCapability {
  const granted = new Set(parseTikTokGrantedScopes(scopeValue));
  const hasBasicInfo = granted.has('user.info.basic');
  const canDirectPost = granted.has('video.publish');
  const canInboxUpload = granted.has('video.upload');
  return {
    hasBasicInfo,
    canDirectPost,
    canInboxUpload,
    canPublishVideo: canDirectPost || canInboxUpload,
  };
}

/** True se il token ha video.publish e/o video.upload. */
export function hasTikTokPublishScopes(scopeValue: string | null | undefined): boolean {
  return getTikTokPublishCapability(scopeValue).canPublishVideo;
}

export function getTikTokPublishScopeHint(): string {
  return TIKTOK_PUBLISH_SCOPES.join(' e/o ');
}

export function formatTikTokScopeAuthorizationError(): string {
  return (
    'Il token TikTok attuale non include i permessi di pubblicazione (video.publish e/o video.upload). ' +
    'Anche se sono abilitati sul portale Developer, vanno richiesti di nuovo al login: ' +
    'clicca "Riautorizza per pubblicare" dalla dashboard e accetta tutti i permessi ' +
    `(scope OAuth: ${TIKTOK_DEFAULT_OAUTH_SCOPES}).`
  );
}

export function isTikTokScopeAuthorizationError(message: string): boolean {
  return /did not authorize the scope|scope[_ ]required|insufficient.*scope|access_token_invalid|scope_not_authorized/i.test(
    message
  );
}

/** App non auditata / sandbox: solo post privati o account sandbox. */
export function isTikTokUnauditedClientError(message: string): boolean {
  return /unaudited_client|sandbox_users|can_only_post_to_private|can_only_post_to_sandbox|code[=:]?\s*40004|code[=:]?\s*40001|\b40004\b|\b40001\b/i.test(
    message
  );
}

export function formatTikTokUnauditedClientError(): string {
  return (
    'TikTok Content Posting v2: client non ancora auditato. ' +
    'Puoi pubblicare solo con privacy SELF_ONLY e l\'account TikTok deve essere Privato ' +
    '(errore tipico: unaudited_client_can_only_post_to_private_accounts / ' +
    'unaudited_client_can_only_post_to_sandbox_users, codici 40001/40004). ' +
    'Dopo l\'audit sul portale Developer potrai usare PUBLIC_TO_EVERYONE.'
  );
}

/**
 * Classifica errori TikTok Content Posting v2 per log / UI.
 */
export function classifyTikTokApiFailure(detail: {
  code?: string | null;
  message?: string | null;
  httpStatus?: number | null;
}): 'scope_permission' | 'url_ownership' | 'guidelines' | 'client_audit' | 'unknown' {
  const blob = `${detail.code || ''} ${detail.message || ''}`.toLowerCase();
  if (
    /unaudited_client|sandbox_users|can_only_post_to_private|can_only_post_to_sandbox|\b40004\b|\b40001\b/.test(
      blob
    )
  ) {
    return 'client_audit';
  }
  if (
    /scope|authorize|permission|access_denied|access_token_invalid/.test(blob) ||
    detail.httpStatus === 401 ||
    detail.httpStatus === 403
  ) {
    if (/url.?ownership|url_ownership/.test(blob)) return 'url_ownership';
    if (/guideline|spam|privacy_level_option/.test(blob)) return 'guidelines';
    return 'scope_permission';
  }
  if (/url.?ownership|url_ownership/.test(blob)) return 'url_ownership';
  if (/guideline|spam|privacy_level_option|invalid_param/.test(blob)) return 'guidelines';
  return 'unknown';
}

export function isTikTokUrlOwnershipError(message: string): boolean {
  return /url ownership|url_ownership_unverified/i.test(message);
}

export function formatTikTokUrlOwnershipError(): string {
  return (
    'TikTok non ha potuto scaricare il media dal nostro URL. Per i video usiamo ora upload diretto; ' +
    'se l\'errore persiste, riprova tra qualche minuto o contatta il supporto.'
  );
}

/** Log verbale strutturato per debug permessi / Content Posting v2. */
export function logTikTokApiVerbal(event: string, details: Record<string, unknown>): void {
  const safe = { ...details };
  if (typeof safe.accessToken === 'string') {
    safe.accessToken = `[redacted len=${safe.accessToken.length}]`;
  }
  console.error(
    `[TikTok Verbale] ${event} | ${JSON.stringify(safe)}`
  );
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
