import { getOrRefreshTikTokToken } from '@/lib/postman/tiktokToken';

const TIKTOK_API_BASE = 'https://open.tiktokapis.com';

export interface TikTokCreatorInfo {
  creatorNickname: string;
  creatorUsername: string;
  creatorAvatarUrl: string;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number;
  /** Client non ancora sottoposto ad audit TikTok: solo post privati. */
  requiresPrivatePost: boolean;
}

export interface TikTokPublishUxOptions {
  privacyLevel: string;
  allowComment: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  commercialDisclosure: boolean;
  brandOrganic: boolean;
  brandContent: boolean;
  musicUsageConsent: boolean;
}

export const TIKTOK_PRIVACY_LABELS: Record<string, string> = {
  PUBLIC_TO_EVERYONE: 'Pubblico — tutti',
  MUTUAL_FOLLOW_FRIENDS: 'Amici che ricambiano il follow',
  FOLLOWER_OF_CREATOR: 'Solo follower',
  SELF_ONLY: 'Solo io (privato)',
};

export function isTikTokApiClientAudited(): boolean {
  return process.env.TIKTOK_API_CLIENT_AUDITED === 'true';
}

function parseTikTokApiError(payload: {
  error?: { code?: string; message?: string };
}): void {
  const code = payload.error?.code;
  if (code && code !== 'ok') {
    throw new Error(payload.error?.message || code);
  }
}

async function tikTokApiPost<T>(
  path: string,
  accessToken: string,
  body: Record<string, unknown> = {}
): Promise<T & { data?: Record<string, unknown>; error?: { code?: string; message?: string } }> {
  const res = await fetch(`${TIKTOK_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify(body),
  });

  const payload = (await res.json()) as T & {
    error?: { code?: string; message?: string };
  };

  if (!res.ok) {
    throw new Error(payload.error?.message || `TikTok API error (${res.status})`);
  }

  parseTikTokApiError(payload);
  return payload;
}

export function filterTikTokPrivacyOptionsForClient(options: string[]): string[] {
  if (isTikTokApiClientAudited()) {
    return options;
  }
  return options.filter((level) => level === 'SELF_ONLY');
}

export async function fetchTikTokCreatorInfo(accessToken: string): Promise<TikTokCreatorInfo> {
  const payload = await tikTokApiPost<{ data?: Record<string, unknown> }>(
    '/v2/post/publish/creator_info/query/',
    accessToken,
    {}
  );

  const data = payload.data ?? {};
  const privacyLevelOptions = Array.isArray(data.privacy_level_options)
    ? data.privacy_level_options.map(String)
    : [];

  return {
    creatorNickname: String(data.creator_nickname || 'TikTok'),
    creatorUsername: String(data.creator_username || ''),
    creatorAvatarUrl: String(data.creator_avatar_url || ''),
    privacyLevelOptions,
    commentDisabled: Boolean(data.comment_disabled),
    duetDisabled: Boolean(data.duet_disabled),
    stitchDisabled: Boolean(data.stitch_disabled),
    maxVideoPostDurationSec: Number(data.max_video_post_duration_sec || 0),
    requiresPrivatePost: !isTikTokApiClientAudited(),
  };
}

export async function getTikTokCreatorInfoForDashboard(): Promise<TikTokCreatorInfo | null> {
  const { accessToken } = await getOrRefreshTikTokToken();
  if (!accessToken) return null;
  return fetchTikTokCreatorInfo(accessToken);
}

export function validateTikTokPublishUxOptions(
  creatorInfo: TikTokCreatorInfo,
  options: TikTokPublishUxOptions,
  isVideo: boolean
): string | null {
  if (!options.musicUsageConsent) {
    return 'Devi accettare la conferma sull\'uso della musica TikTok prima di pubblicare.';
  }

  const allowedPrivacy = filterTikTokPrivacyOptionsForClient(creatorInfo.privacyLevelOptions);
  if (!options.privacyLevel || !allowedPrivacy.includes(options.privacyLevel)) {
    return 'Seleziona un livello di privacy valido.';
  }

  if (options.commercialDisclosure && options.brandContent && options.privacyLevel === 'SELF_ONLY') {
    return 'I contenuti branded non possono essere pubblicati con visibilità "Solo io".';
  }

  if (options.commercialDisclosure && !options.brandContent && !options.brandOrganic) {
    return 'Se abiliti la disclosure commerciale, seleziona almeno una opzione (Your brand o Branded content).';
  }

  if (!options.commercialDisclosure) {
    options.brandContent = false;
    options.brandOrganic = false;
  }

  return null;
}

export function buildTikTokPostInfoFromUx(
  title: string,
  creatorInfo: TikTokCreatorInfo,
  options: TikTokPublishUxOptions,
  isVideo: boolean
): Record<string, unknown> {
  const brandContent = options.commercialDisclosure && options.brandContent;
  const brandOrganic = options.commercialDisclosure && options.brandOrganic;

  const postInfo: Record<string, unknown> = {
    title: title.slice(0, 2200),
    privacy_level: options.privacyLevel,
    disable_comment: creatorInfo.commentDisabled || !options.allowComment,
    brand_content_toggle: brandContent,
    brand_organic_toggle: brandOrganic,
  };

  if (isVideo) {
    postInfo.disable_duet = creatorInfo.duetDisabled || !options.allowDuet;
    postInfo.disable_stitch = creatorInfo.stitchDisabled || !options.allowStitch;
  }

  return postInfo;
}

export function defaultTikTokPublishUxOptions(creatorInfo: TikTokCreatorInfo): TikTokPublishUxOptions {
  const allowed = filterTikTokPrivacyOptionsForClient(creatorInfo.privacyLevelOptions);
  return {
    privacyLevel: allowed[0] || 'SELF_ONLY',
    allowComment: false,
    allowDuet: false,
    allowStitch: false,
    commercialDisclosure: false,
    brandOrganic: false,
    brandContent: false,
    musicUsageConsent: false,
  };
}

export function isTikTokGuidelinesError(message: string): boolean {
  return /integration guidelines|content-sharing-guidelines|guidelines/i.test(message);
}

export function formatTikTokGuidelinesError(requiresPrivatePost: boolean): string {
  if (requiresPrivatePost) {
    return (
      'App TikTok non ancora verificata: i post devono essere pubblicati come "Solo io" (privati). ' +
      'Usa il modulo di pubblicazione per selezionare privacy e dare il consenso richiesto da TikTok.'
    );
  }
  return 'Verifica le impostazioni di pubblicazione TikTok (privacy, consenso musica, disclosure commerciale).';
}

export function getTikTokMusicUsageDeclaration(options: TikTokPublishUxOptions): string {
  if (options.brandContent) {
    return 'Pubblicando, accetti la Branded Content Policy e la Music Usage Confirmation di TikTok.';
  }
  return 'Pubblicando, accetti la Music Usage Confirmation di TikTok.';
}
